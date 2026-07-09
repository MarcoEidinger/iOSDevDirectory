const fs = require('fs');

/**
 * Build a map of blog entries keyed by category path and title
 * @param {Array} json - Parsed blogs.json array
 * @returns {Map<string, Map<string, Object>>} Map of path -> (title -> entry)
 */
function buildEntryMap(json) {
  const map = new Map();
  json.forEach(lang => {
    lang.categories.forEach(cat => {
      const key = `${lang.language}.${cat.slug}`;
      map.set(key, new Map(cat.sites.map(s => [s.title, s])));
    });
  });
  return map;
}

/**
 * Detect added and modified entries between base and head versions
 * @param {Array} baseJson - Base version of blogs.json
 * @param {Array} headJson - HEAD version of blogs.json
 * @returns {Object} Object with added and modified arrays
 */
function detectChanges(baseJson, headJson) {
  const baseMap = buildEntryMap(baseJson);
  const added = [];
  const modified = [];

  headJson.forEach(lang => {
    lang.categories.forEach(cat => {
      const key = `${lang.language}.${cat.slug}`;
      const baseSites = baseMap.get(key) || new Map();

      cat.sites.forEach(site => {
        const baseEntry = baseSites.get(site.title);

        if (!baseEntry) {
          // Entry doesn't exist in base - it's added
          added.push({ path: key, title: site.title, author: site.author });
        } else if (JSON.stringify(baseEntry) !== JSON.stringify(site)) {
          // Entry exists but content differs - it's modified
          const changes = Object.keys(site).filter(
            field => JSON.stringify(site[field]) !== JSON.stringify(baseEntry[field])
          );

          // Also check for removed fields
          Object.keys(baseEntry).forEach(field => {
            if (!(field in site) && !changes.includes(field)) {
              changes.push(`-${field}`);
            }
          });

          modified.push({
            path: key,
            title: site.title,
            author: site.author,
            changes
          });
        }
      });
    });
  });

  return { added, modified };
}

/**
 * Generate markdown comment for PR
 * @param {Array} added - Array of added entries
 * @param {Array} modified - Array of modified entries
 * @returns {string|null} Markdown comment or null if no changes
 */
function generateComment(added, modified) {
  if (added.length === 0 && modified.length === 0) {
    return null;
  }

  let comment = '## 📝 Blog Entry Changes\n\n';
  comment += 'This PR modifies the following categories:\n\n';

  if (added.length > 0) {
    comment += '### ➕ Added Entries\n';
    added.forEach(item => {
      comment += `- **${item.path}**: "${item.title}"`;
      if (item.author) {
        comment += ` by ${item.author}`;
      }
      comment += '\n';
    });
    comment += '\n';
  }

  if (modified.length > 0) {
    comment += '### ✏️ Modified Entries\n';
    modified.forEach(item => {
      const changeDetails = item.changes.join(', ');
      comment += `- **${item.path}**: "${item.title}" (updated: ${changeDetails})\n`;
    });
    comment += '\n';
  }

  comment += '---\n';
  comment += '*Automated by [PR Annotation Workflow](.github/workflows/annotate-pr-categories.yml)*';

  return comment;
}

// Main execution
try {
  const baseJson = JSON.parse(fs.readFileSync('blogs.json', 'utf8'));
  const headJson = JSON.parse(fs.readFileSync('blogs-head.json', 'utf8'));

  const { added, modified } = detectChanges(baseJson, headJson);
  const comment = generateComment(added, modified);

  if (comment) {
    console.log('COMMENT<<EOF');
    console.log(comment);
    console.log('EOF');
  } else {
    console.log('NO_CHANGES=true');
  }
} catch (error) {
  console.error('Error analyzing blog changes:', error.message);
  process.exit(1);
}
