const fs = require('fs');

const files = [
  { staging: 'api/searchVideos.js.staging', production: 'api/searchVideos.js' },
  { staging: 'api/fetchPlaylist.js.staging', production: 'api/fetchPlaylist.js' },
  { staging: 'api/hydrateTags.js.staging', production: 'api/hydrateTags.js' }
];

files.forEach(file => {
  if (fs.existsSync(file.staging)) {
    if (fs.existsSync(file.production)) {
      fs.copyFileSync(file.production, file.production + '.bak');
    }
    fs.renameSync(file.staging, file.production);
    console.log(`Swapped ${file.staging} -> ${file.production}`);
  } else {
    console.error(`Staging file not found: ${file.staging}`);
  }
});
