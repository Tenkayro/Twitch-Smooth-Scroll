import * as p from '@clack/prompts';
import { ZipArchive } from 'archiver';
import { execFile } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, '..');
const MANIFEST_PATH = path.join(ROOT_DIR, 'manifest.json');
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');
const PACKAGE_LOCK_PATH = path.join(ROOT_DIR, 'package-lock.json');
const RELEASE_DIR = path.join(ROOT_DIR, 'release');
const PACKAGE_FILES = [
  'manifest.json',
  'content.js',
  'popup.html',
  'popup.css',
  'popup.js',
  'icons',
  '_locales'
];

function cancelIfNeeded(value) {
  if (!p.isCancel(value)) return value;
  p.cancel('Release cancelled. No files were changed.');
  process.exit(0);
}

function parseVersion(version) {
  const parts = String(version).split('.');
  if (parts.length < 1 || parts.length > 4) return null;
  if (parts.some((part) => !/^(0|[1-9]\d*)$/.test(part))) return null;

  const numbers = parts.map(Number);
  if (numbers.every((part) => part === 0)) return null;
  if (numbers.some((part) => part > 65535)) return null;
  return numbers;
}

function compareVersions(left, right) {
  const a = [...left, 0, 0, 0, 0].slice(0, 4);
  const b = [...right, 0, 0, 0, 0].slice(0, 4);
  for (let index = 0; index < 4; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function bumpVersion(currentVersion, releaseType) {
  const [major = 0, minor = 0, patch = 0] = parseVersion(currentVersion);
  if (releaseType === 'major') return `${major + 1}.0.0`;
  if (releaseType === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function validateCustomVersion(value, currentParts) {
  const candidate = parseVersion(value);
  if (!candidate || candidate.length !== 3) {
    return 'Use three numbers from 0 to 65535, for example 2.0.0.';
  }
  if (compareVersions(candidate, currentParts) <= 0) {
    return 'The custom version must be newer than the current version.';
  }
}

async function runTests() {
  const checks = [
    ['--check', 'content.js'],
    ['--check', 'popup.js'],
    ['tests/content.test.js']
  ];

  for (const args of checks) {
    await execFileAsync(process.execPath, args, { cwd: ROOT_DIR });
  }
}

async function validatePackageFiles() {
  for (const entry of PACKAGE_FILES) {
    await access(path.join(ROOT_DIR, entry));
  }

  const localeRoot = path.join(ROOT_DIR, '_locales');
  const localeDirectories = await readdir(localeRoot, { withFileTypes: true });
  const locales = localeDirectories.filter((entry) => entry.isDirectory());
  if (locales.length === 0) throw new Error('No locale directories were found.');

  for (const locale of locales) {
    const messagesPath = path.join(localeRoot, locale.name, 'messages.json');
    JSON.parse(await readFile(messagesPath, 'utf8'));
  }
}

async function createZip(outputPath) {
  await new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath, { flags: 'wx' });
    const archive = new ZipArchive({ zlib: { level: 9 } });

    output.on('close', resolve);
    output.on('error', reject);
    archive.on('warning', (error) => {
      if (error.code === 'ENOENT') reject(error);
      else p.log.warn(error.message);
    });
    archive.on('error', reject);
    archive.pipe(output);

    for (const entry of PACKAGE_FILES) {
      const source = path.join(ROOT_DIR, entry);
      if (entry === 'icons' || entry === '_locales') {
        archive.directory(source, entry);
      } else {
        archive.file(source, { name: entry });
      }
    }

    archive.finalize().catch(reject);
  });
}

async function main() {
  p.intro('Twitch Smooth Scroll · Release');

  const originalManifestSource = await readFile(MANIFEST_PATH, 'utf8');
  const originalPackageSource = await readFile(PACKAGE_JSON_PATH, 'utf8');
  const originalLockSource = await readFile(PACKAGE_LOCK_PATH, 'utf8');
  const manifest = JSON.parse(originalManifestSource);
  const packageJson = JSON.parse(originalPackageSource);
  const packageLock = JSON.parse(originalLockSource);
  const currentParts = parseVersion(manifest.version);
  if (!currentParts) throw new Error(`Invalid manifest version: ${manifest.version}`);

  const releaseType = cancelIfNeeded(
    await p.select({
      message: `Current version: ${manifest.version}. What should be released?`,
      options: [
        { value: 'patch', label: 'Patch', hint: bumpVersion(manifest.version, 'patch') },
        { value: 'minor', label: 'Minor', hint: bumpVersion(manifest.version, 'minor') },
        { value: 'major', label: 'Major', hint: bumpVersion(manifest.version, 'major') },
        { value: 'custom', label: 'Custom version' }
      ]
    })
  );

  let nextVersion = bumpVersion(manifest.version, releaseType);
  if (releaseType === 'custom') {
    nextVersion = cancelIfNeeded(
      await p.text({
        message: 'Enter the new Chrome extension version',
        placeholder: '2.0.0',
        validate: (value) => validateCustomVersion(value, currentParts)
      })
    );
  }

  const fileName = `twitch-smooth-scroll-v${nextVersion}.zip`;
  const outputPath = path.join(RELEASE_DIR, fileName);
  const temporaryPath = `${outputPath}.tmp`;
  let outputExists = false;
  try {
    await access(outputPath);
    outputExists = true;
  } catch {
    // The selected release does not exist yet.
  }

  const confirmed = cancelIfNeeded(
    await p.confirm({
      message: outputExists
        ? `Release v${nextVersion} already exists. Replace it?`
        : `Create release v${nextVersion}?`,
      initialValue: !outputExists
    })
  );
  if (!confirmed) {
    p.cancel('Release cancelled. No files were changed.');
    return;
  }

  const spinner = p.spinner();
  let metadataChanged = false;
  try {
    spinner.start('Validating extension');
    await validatePackageFiles();
    await runTests();
    spinner.message('Updating version');

    manifest.version = nextVersion;
    packageJson.version = nextVersion;
    packageLock.version = nextVersion;
    if (packageLock.packages?.['']) packageLock.packages[''].version = nextVersion;
    metadataChanged = true;
    await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await writeFile(PACKAGE_JSON_PATH, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
    await writeFile(PACKAGE_LOCK_PATH, `${JSON.stringify(packageLock, null, 2)}\n`, 'utf8');

    await mkdir(RELEASE_DIR, { recursive: true });
    await rm(temporaryPath, { force: true });
    spinner.message('Creating ZIP archive');
    await createZip(temporaryPath);

    if (outputExists) await rm(outputPath, { force: true });
    await rename(temporaryPath, outputPath);
    const archiveStats = await stat(outputPath);
    spinner.stop('Release created');

    p.note(
      [
        `Version: ${nextVersion}`,
        `File: release/${fileName}`,
        `Size: ${(archiveStats.size / 1024).toFixed(1)} KB`
      ].join('\n'),
      'Release'
    );
    p.outro('Ready to upload.');
  } catch (error) {
    if (metadataChanged) {
      await writeFile(MANIFEST_PATH, originalManifestSource, 'utf8');
      await writeFile(PACKAGE_JSON_PATH, originalPackageSource, 'utf8');
      await writeFile(PACKAGE_LOCK_PATH, originalLockSource, 'utf8');
    }
    await rm(temporaryPath, { force: true });
    spinner.stop('Release failed');
    p.log.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  p.log.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
