import { fileExtension, filepath, trimPathSlashes, writeFileRecursively } from '../utils.js';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { isAbsolute } from 'path';
import { buildFile } from '../parser.js';
import { DEFAULT_IMPORT_TYPE } from '../constants.js';

function getImportTypeByExtension(ext) {
    switch (ext) {
        case 'css':
            return 'external-css';

        default:
            return DEFAULT_IMPORT_TYPE;
    }
}

async function processDependencyFile(config, filename, ext, type) {
    const input = filepath(config.libPath, filename);
    let output = filepath(config.exportPath, 'c3runtime/libs', filename);
    output = output.replace(/\.ts$/, '.js');

    if (ext === 'ts') {
        writeFileRecursively(output, await buildFile(input, config));
        return output;
    }

    writeFileRecursively(output, readFileSync(input));
    return output;
}

/**
 * @param {BuildConfig} config 
 */
export function getTypeDefinitions(config) {
    const dirPath = filepath(config.defPath);

    if (!existsSync(dirPath)) return [];

    const definitions = readdirSync(dirPath)
        .filter((v => v.endsWith('.d.ts')))
        .map((filename) => {
            const defPath = config.defPath;
            const exportPath = config.exportPath;

            const input = filepath(defPath, '/', filename);
            const output = input.replace(dirPath, filepath(exportPath, 'c3runtime/'))

            writeFileRecursively(output, readFileSync(input));

            return trimPathSlashes(output.replace(filepath(exportPath), ''));
        });

    return definitions;
}

/**
 * @param {import('../../types/config.js').BuildConfig} config 
 * @param {import('../../types/config.js').BuiltAddonConfig} addon 
 */
export async function getFileListFromConfig(config, addon) {
    const exportPath = filepath(config.exportPath);
    const libPath = filepath(config.libPath);
    const copyConfig = addon?.fileDependencies ?? {};

    if (!existsSync(libPath)) return {};

    const files = await readdirSync(libPath).reduce(async (objP, filename) => {
        const obj = await objP;

        if (filename.startsWith('.')) {
            return obj;
        }

        const ext = fileExtension(filename);
        let importType;

        if (copyConfig[filename]) {
            importType = copyConfig[filename];
            delete copyConfig[filename];
        } else {
            importType = getImportTypeByExtension(ext);
        }

        let output = await processDependencyFile(
            config,
            filename,
            ext,
            importType
        );

        if (isAbsolute(output)) {
            output = trimPathSlashes(output.replace(exportPath, ''));
        }

        obj[output] = importType;
        return obj;
    }, Promise.resolve({}));

    // There's a mismatch betwwen the files from libs and 
    // the files on the config... 
    // TODO: Check if these are remote files
    const leftFiles = Object.keys(copyConfig);
    if (leftFiles.length) {
        console.warn(`Following dependency files were not found: ${leftFiles.join(', ')}`);
    }

    return files;
}