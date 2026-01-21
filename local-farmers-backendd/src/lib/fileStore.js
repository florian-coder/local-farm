const fs = require('fs/promises');
const path = require('path');

const locks = new Map();

const ensureDir = async (dirPath) => {
  await fs.mkdir(dirPath, { recursive: true });
};

const readJsonFile = async (filePath) => {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
};

const writeJsonFile = async (filePath, data) => {
  await ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp`;
  const payload = `${JSON.stringify(data, null, 2)}\n`;
  await fs.writeFile(tempPath, payload, 'utf8');
  await fs.rename(tempPath, filePath);
};

const withFileLock = async (filePath, action) => {
  const previous = locks.get(filePath) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  locks.set(filePath, previous.then(() => current).catch(() => current));

  await previous;
  try {
    return await action();
  } finally {
    release();
    if (locks.get(filePath) === current) {
      locks.delete(filePath);
    }
  }
};

const readJson = async (filePath, defaultData) => {
  try {
    return await readJsonFile(filePath);
  } catch (err) {
    if (err.code === 'ENOENT' && defaultData !== undefined) {
      await writeJson(filePath, defaultData);
      return defaultData;
    }
    throw err;
  }
};

const writeJson = async (filePath, data) =>
  withFileLock(filePath, () => writeJsonFile(filePath, data));

const updateJson = async (filePath, defaultData, updater) =>
  withFileLock(filePath, async () => {
    let data = defaultData;

    try {
      data = await readJsonFile(filePath);
    } catch (err) {
      if (!(err.code === 'ENOENT' && defaultData !== undefined)) {
        throw err;
      }
    }

    const updateResult = await updater(data);
    const nextData =
      updateResult &&
      typeof updateResult === 'object' &&
      Object.prototype.hasOwnProperty.call(updateResult, 'data')
        ? updateResult.data
        : data;
    const result =
      updateResult &&
      typeof updateResult === 'object' &&
      Object.prototype.hasOwnProperty.call(updateResult, 'result')
        ? updateResult.result
        : updateResult;

    await writeJsonFile(filePath, nextData);
    return result;
  });

module.exports = {
  readJson,
  writeJson,
  updateJson,
  withFileLock,
};
