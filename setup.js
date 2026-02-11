#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('\n🚀 hbar.ink Setup Script\n');

// Check if .env.local exists
if (!fs.existsSync(path.join(__dirname, '.env.local'))) {
  console.log('Creating .env.local file...');
  fs.writeFileSync(
    path.join(__dirname, '.env.local'),
    'NEXT_PUBLIC_SUPABASE_URL=your-supabase-url\nNEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key\n'
  );
}

console.log('\n📋 Setup Instructions:\n');
console.log('1. Create a new Supabase project at https://supabase.com');
console.log('2. Get your Supabase URL and anon key from the project settings');
console.log('3. Update the .env.local file with your Supabase credentials');
console.log('4. Run the SQL schema in the Supabase SQL editor:');
console.log('   - Copy the contents of supabase/schema.sql');
console.log('   - Paste into the Supabase SQL editor');
console.log('   - Run the SQL commands\n');

rl.question('Would you like to open the schema.sql file now? (y/n) ', (answer) => {
  if (answer.toLowerCase() === 'y') {
    try {
      const schemaPath = path.join(__dirname, 'supabase', 'schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf8');
      console.log('\n--- schema.sql ---\n');
      console.log(schema);
      console.log('\n--- End of schema.sql ---\n');
    } catch (error) {
      console.error('Error reading schema.sql:', error);
    }
  }
  
  rl.question('Would you like to start the development server now? (y/n) ', (answer) => {
    if (answer.toLowerCase() === 'y') {
      console.log('\nStarting development server...');
      try {
        execSync('npm run dev', { stdio: 'inherit' });
      } catch (error) {
        console.error('Error starting development server:', error);
      }
    } else {
      console.log('\nTo start the development server, run: npm run dev');
    }
    
    rl.close();
  });
});
