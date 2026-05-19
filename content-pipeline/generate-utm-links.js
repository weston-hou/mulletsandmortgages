#!/usr/bin/env node
/**
 * UTM Link Generator for Mullets & Mortgages
 * Run: node generate-utm-links.js "clip_description"
 *
 * Outputs ready-to-paste links for each platform with:
 * - utm_source (platform name)
 * - utm_campaign (clip description/slug)
 * - utm_content (format: short/medium/teaser)
 * - clicked_at (unix timestamp of NOW — set when the link is generated for the post)
 */

const BASE_URL = 'https://mulletsandmortgages.com';

const campaign = process.argv[2]
  ? process.argv[2].toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
  : `clip_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;

const clickedAt = Math.floor(Date.now() / 1000);

const platforms = [
  { name: 'tiktok',     medium: 'video', content: 'short' },
  { name: 'instagram',  medium: 'reel',  content: 'short' },
  { name: 'youtube',    medium: 'video', content: 'medium' },
  { name: 'youtube',    medium: 'short', content: 'short' },
  { name: 'linkedin',   medium: 'video', content: 'medium' },
  { name: 'twitter',    medium: 'video', content: 'teaser' },
];

console.log(`\n✂️  Mullets & Mortgages — UTM Links\n`);
console.log(`Campaign: ${campaign}`);
console.log(`Timestamp: ${clickedAt} (${new Date().toLocaleString()})\n`);
console.log('─'.repeat(60));

platforms.forEach(({ name, medium, content }) => {
  const params = new URLSearchParams({
    utm_source:   name,
    utm_medium:   medium,
    utm_campaign: campaign,
    utm_content:  content,
    clicked_at:   clickedAt.toString(),
  });
  console.log(`\n${name.toUpperCase()} (${content}):`);
  console.log(`${BASE_URL}/?${params.toString()}`);
});

console.log('\n' + '─'.repeat(60));
console.log('\nPaste these links into your post captions/bios.\n');
