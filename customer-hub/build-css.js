#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const postcss = require('postcss');
const tailwindcss = require('tailwindcss');
const autoprefixer = require('autoprefixer');

const inputFile = path.join(__dirname, 'styles/input.css');
const outputFile = path.join(__dirname, 'styles/tailwind.css');
const configFile = path.join(__dirname, 'tailwind.config.js');

async function build() {
  try {
    const css = fs.readFileSync(inputFile, 'utf8');
    const result = await postcss([
      tailwindcss(configFile),
      autoprefixer
    ]).process(css, { from: inputFile, to: outputFile });

    fs.writeFileSync(outputFile, result.css);
    if (result.map) {
      fs.writeFileSync(outputFile + '.map', result.map.toString());
    }
    console.log('✓ Tailwind CSS built successfully!');
  } catch (error) {
    console.error('Error building CSS:', error);
    process.exit(1);
  }
}

build();
