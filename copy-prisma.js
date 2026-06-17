const fs = require('fs');
const path = require('path');

function copyFolderSync(from, to) {
  if (!fs.existsSync(to)) {
    fs.mkdirSync(to, { recursive: true });
  }
  fs.readdirSync(from).forEach(element => {
    const stat = fs.lstatSync(path.join(from, element));
    if (stat.isFile()) {
      fs.copyFileSync(path.join(from, element), path.join(to, element));
    } else if (stat.isDirectory()) {
      copyFolderSync(path.join(from, element), path.join(to, element));
    }
  });
}

const src = path.join(__dirname, 'generated', 'prisma');
const dest = path.join(__dirname, 'dist', 'generated', 'prisma');

if (fs.existsSync(src)) {
  copyFolderSync(src, dest);
  console.log('Successfully copied prisma client assets to dist.');
} else {
  console.error('Source directory generated/prisma does not exist.');
}
