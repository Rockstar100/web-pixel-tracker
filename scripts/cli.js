#!/usr/bin/env node

/**
 * Seleric Tracker CLI Helper
 * Quick commands for common tasks
 */

const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function exec(command) {
  try {
    execSync(command, { stdio: 'inherit' });
  } catch (error) {
    console.error(`Error executing: ${command}`);
    process.exit(1);
  }
}

function showMenu() {
  console.log('\n🎯 Seleric Tracker - Quick Actions\n');
  console.log('1. 🚀 Start development server');
  console.log('2. 🗄️  Setup database (generate + migrate)');
  console.log('3. 🔄 Reset database (fresh start)');
  console.log('4. 📦 Generate extension');
  console.log('5. 📊 View Prisma Studio (database UI)');
  console.log('6. 🧪 Run type check');
  console.log('7. 🏗️  Build for production');
  console.log('8. 🧹 Clean old events (90 days)');
  console.log('0. Exit\n');
}

function handleChoice(choice) {
  switch (choice) {
    case '1':
      console.log('\n🚀 Starting development server...\n');
      exec('npm run dev');
      break;
    
    case '2':
      console.log('\n🗄️  Setting up database...\n');
      exec('npx prisma generate');
      exec('npx prisma migrate dev --name setup');
      console.log('\n✅ Database ready!\n');
      rl.close();
      break;
    
    case '3':
      console.log('\n🔄 Resetting database...\n');
      exec('npx prisma migrate reset --force');
      console.log('\n✅ Database reset complete!\n');
      rl.close();
      break;
    
    case '4':
      console.log('\n📦 Generating extension...\n');
      exec('npm run generate extension');
      break;
    
    case '5':
      console.log('\n📊 Opening Prisma Studio...\n');
      exec('npx prisma studio');
      break;
    
    case '6':
      console.log('\n🧪 Running type check...\n');
      exec('npm run typecheck');
      rl.close();
      break;
    
    case '7':
      console.log('\n🏗️  Building for production...\n');
      exec('npm run build');
      console.log('\n✅ Build complete!\n');
      rl.close();
      break;
    
    case '8':
      console.log('\n🧹 This would run cleanup in production.\n');
      console.log('For now, run this in your app:\n');
      console.log('  EventDeduplicator.cleanup(90);\n');
      rl.close();
      break;
    
    case '0':
      console.log('\n👋 Goodbye!\n');
      rl.close();
      break;
    
    default:
      console.log('\n❌ Invalid choice. Try again.\n');
      prompt();
  }
}

function prompt() {
  rl.question('Choose an option: ', (choice) => {
    handleChoice(choice.trim());
  });
}

// Main
showMenu();
prompt();
