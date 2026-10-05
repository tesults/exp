const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const projectDir = path.resolve(__dirname, '..');
const packageInfo = require('../package.json');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-packed-'));
const sampleDir = path.join(root, 'sample');

const run = function (command, args, options) {
    const result = childProcess.spawnSync(command, args, Object.assign({
        cwd: projectDir,
        encoding: 'utf8'
    }, options));

    assert.strictEqual(result.status, 0, result.stdout + result.stderr);
    return result;
};

try {
    fs.mkdirSync(sampleDir);

    const pack = run('npm', [
        'pack',
        '--ignore-scripts',
        '--json',
        '--pack-destination',
        root
    ]);
    const packResult = JSON.parse(pack.stdout);
    assert.strictEqual(packResult.length, 1);
    assert.strictEqual(packResult[0].version, packageInfo.version);

    const tarball = path.join(root, packResult[0].filename);
    run('npm', [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        tarball
    ], {cwd: sampleDir});

    const testsDir = path.join(sampleDir, 'tests');
    fs.mkdirSync(testsDir);
    fs.writeFileSync(path.join(testsDir, 'suite.js'), [
        "const exp = require('exp-tf');",
        "module.exports = {",
        "    suite: 'Packed artifact',",
        "    cases: [",
        "        {name: 'packed pass', test: function () { exp.file('artifact', 'packed.txt'); }},",
        "        {name: 'packed failure', test: function () { return 'packed failure reason'; }}",
        "    ]",
        "};"
    ].join('\n'));

    const outputFile = path.join(sampleDir, 'nested', 'results.json');
    const env = Object.assign({}, process.env, {
        TESULTS_OUTPUT_FILE: outputFile
    });
    const executable = path.join(sampleDir, 'node_modules', '.bin', 'exp');
    run(executable, ['dir=' + testsDir], {cwd: sampleDir, env: env});

    const output = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
    assert.strictEqual(output.target, '');
    assert.deepStrictEqual(output.metadata, {
        integration_name: 'exp-tf',
        integration_version: packageInfo.version,
        test_framework: 'exp'
    });
    assert.strictEqual(output.results.cases.length, 2);
    assert.strictEqual(output.results.cases[0].result, 'pass');
    assert.strictEqual(output.results.cases[1].result, 'fail');
    assert.strictEqual(output.results.cases[1].reason, 'packed failure reason');
    assert.ok(output.results.cases[0].files.length > 0);
    output.results.cases[0].files.forEach(function (file) {
        assert.ok(path.isAbsolute(file));
        assert.ok(fs.existsSync(file));
    });

    console.log('EXP packed artifact test passed');
} finally {
    fs.rmSync(root, {recursive: true, force: true});
}
