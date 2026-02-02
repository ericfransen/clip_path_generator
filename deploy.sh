#!/usr/bin/env sh

# abort on errors
set -e

echo "Building project..."
npm run build

echo "Navigating to dist folder..."
cd dist

echo "Creating .nojekyll..."
echo > .nojekyll

echo "Initializing git..."
git init
git checkout -B gh-pages
git add -A
git commit -m 'deploy'

echo "Pushing to gh-pages..."
# Using the specific repo URL to avoid any ambiguity
git push -f git@github.com:ericfransen/clip_path_generator.git gh-pages

echo "Deployment complete."
cd -