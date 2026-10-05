const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const projectDir = path.resolve(__dirname, '..');
const cliFile = path.join(projectDir, 'cli.js');
const expFile = path.join(projectDir, 'exp.js');
const mockFile = path.join(__dirname, 'mock-tesults.js');
const packageInfo = require('../package.json');

const removeDirectory = function (directory) {
    if (!fs.existsSync(directory)) {
        return;
    }

    fs.readdirSync(directory).forEach(function (entry) {
        const entryPath = path.join(directory, entry);
        if (fs.lstatSync(entryPath).isDirectory()) {
            removeDirectory(entryPath);
        } else {
            fs.unlinkSync(entryPath);
        }
    });
    fs.rmdirSync(directory);
};

const createFixture = function (root) {
    const fixtureDir = path.join(root, 'fixtures');
    fs.mkdirSync(fixtureDir);
    fs.writeFileSync(path.join(fixtureDir, 'suite.js'), [
        "const exp = require(" + JSON.stringify(expFile) + ");",
        "module.exports = {",
        "    suite: 'EXP reporter regression',",
        "    cases: [",
        "        {name: 'sync pass', test: function () { exp.log('sync pass log'); exp.file('attachment', 'artifact.txt'); }},",
        "        {name: 'unknown result', test: function () { return 'unknown'; }},",
        "        {name: 'intentional failure', test: function () { return 'intentional failure reason'; }},",
        "        {name: 'async pass', test: async function () { await exp.wait(1); }},",
        "        {name: 'callback pass', test: function (callback) { callback(); }},",
        "        {name: 'parameterized pass', paramsList: [{value: 1}, {value: 2}], test: function () {}}",
        "    ]",
        "};"
    ].join('\n'));
    return fixtureDir;
};

const runScenario = function (options) {
    removeDirectory(path.join(projectDir, 'temp'));

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-test-'));
    const fixtureDir = createFixture(root);
    const uploadFile = path.join(root, 'upload.json');
    const outputFile = options.outputFile || path.join(root, 'nested', 'results.json');
    const env = Object.assign({}, process.env, {
        EXP_UPLOAD_CAPTURE: uploadFile
    });
    const args = ['-r', mockFile, cliFile, 'dir=' + fixtureDir];

    if (options.output) {
        env.TESULTS_OUTPUT_FILE = outputFile;
    } else {
        delete env.TESULTS_OUTPUT_FILE;
    }

    if (options.target) {
        args.push('tesults-target=' + options.target);
    }

    const run = childProcess.spawnSync(process.execPath, args, {
        cwd: projectDir,
        env: env,
        encoding: 'utf8'
    });

    assert.strictEqual(run.status, 0, run.stdout + run.stderr);

    return {
        outputFile: outputFile,
        output: fs.existsSync(outputFile) ? JSON.parse(fs.readFileSync(outputFile, 'utf8')) : undefined,
        upload: fs.existsSync(uploadFile) ? JSON.parse(fs.readFileSync(uploadFile, 'utf8')) : undefined,
        stdout: run.stdout
    };
};

const assertPayload = function (payload, target) {
    assert.ok(payload);
    assert.strictEqual(payload.target, target);
    assert.deepStrictEqual(payload.metadata, {
        integration_name: 'exp-tf',
        integration_version: packageInfo.version,
        test_framework: 'exp'
    });
    assert.strictEqual(payload.results.cases.length, 7);

    const results = payload.results.cases.map(function (testCase) {
        return testCase.result;
    });
    assert.strictEqual(results.filter(function (result) { return result === 'pass'; }).length, 5);
    assert.strictEqual(results.filter(function (result) { return result === 'fail'; }).length, 1);
    assert.strictEqual(results.filter(function (result) { return result === 'unknown'; }).length, 1);

    const failure = payload.results.cases.filter(function (testCase) {
        return testCase.result === 'fail';
    })[0];
    assert.strictEqual(failure.reason, 'intentional failure reason');

    const files = payload.results.cases.reduce(function (allFiles, testCase) {
        return allFiles.concat(testCase.files || []);
    }, []);
    assert.ok(files.length > 0);
    files.forEach(function (file) {
        assert.ok(path.isAbsolute(file));
        assert.ok(fs.existsSync(file));
    });
};

const disabled = runScenario({});
assert.strictEqual(disabled.output, undefined);
assert.strictEqual(disabled.upload, undefined);
assert.ok(disabled.stdout.indexOf('Tesults disabled') !== -1);

const targetOnly = runScenario({target: 'target-token'});
assert.strictEqual(targetOnly.output, undefined);
assertPayload(targetOnly.upload, 'target-token');

const outputOnly = runScenario({output: true});
assert.strictEqual(outputOnly.upload, undefined);
assertPayload(outputOnly.output, '');
assert.ok(outputOnly.stdout.indexOf('Tesults upload disabled') !== -1);

const both = runScenario({target: 'target-token', output: true});
assertPayload(both.output, 'target-token');
assertPayload(both.upload, 'target-token');

const blockedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-blocked-'));
const blockedParent = path.join(blockedRoot, 'not-a-directory');
fs.writeFileSync(blockedParent, 'block output directory creation');
const writeFailure = runScenario({
    target: 'target-token',
    output: true,
    outputFile: path.join(blockedParent, 'results.json')
});
assert.strictEqual(writeFailure.output, undefined);
assertPayload(writeFailure.upload, 'target-token');
assert.ok(writeFailure.stdout.indexOf('Error writing Tesults results:') !== -1);

removeDirectory(path.join(projectDir, 'temp'));
console.log('EXP reporter regression tests passed');
