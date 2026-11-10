// Simple test script to verify the setup works
const fs = require('fs');
const path = require('path');

console.log('Testing Excel Translator setup...');

// Check if key directories exist
const dirsToCheck = [
  'project/apps/api/src/modules/file-upload',
  'project/apps/api/src/modules/text-extraction', 
  'project/apps/api/src/modules/translation',
  'project/apps/api/src/modules/job-management',
  'project/apps/api/src/modules/authentication',
  'project/apps/api/src/modules/progress-tracking',
  'project/apps/web/src'
];

let allGood = true;

dirsToCheck.forEach(dir => {
  const fullPath = path.join(__dirname, dir);
  if (fs.existsSync(fullPath)) {
    console.log(`✓ ${dir}`);
  } else {
    console.log(`✗ ${dir} - Missing`);
    allGood = false;
  }
});

// Check key files exist
const filesToCheck = [
  'project/apps/api/src/app.module.ts',
  'project/apps/api/src/main.ts',
  'project/apps/web/src/App.tsx'
];

filesToCheck.forEach(file => {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    console.log(`✓ ${file}`);
  } else {
    console.log(`✗ ${file} - Missing`);
    allGood = false;
  }
});

if (allGood) {
  console.log('\n🎉 All setup files are in place!');
  console.log('The Excel Translator application is ready for development.');
} else {
  console.log('\n❌ Some setup files are missing');
}

console.log('\nTo run tests:');
console.log('npm run test');