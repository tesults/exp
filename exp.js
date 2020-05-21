// Requirements
const fs = require('fs');
const path = require('path');
const tesults = require('tesults');
const uuidv5 = require("uuid/v5");
const util = require("util");

// Args
module.exports.dirs = [];
module.exports.console = {log: true};
module.exports.tesults = {target: undefined}

// Constants
const defaultTimeout = 60000;
const namespace = '748f6b41-dad7-4c92-bc21-540103b48ecd';

// Variables
let results = {cases: []};
let totals = {total: 0, pass: 0, fail: 0, unknown: 0};
let suiteTimeout = defaultTimeout;
let started = false;
let testFile = undefined;

// Creates as hash to use for test file saving
const hash = function () {
    let testCase = testFile.context;
    if (testCase.context === undefined) {
        return 'notestcase';
    }
    let testCaseString = (testCase.suite === undefined ? "" : testCase.suite) + testCase.name;
    if (testCase.params !== undefined) {
        let keys = [];
        Object.keys(testCase.params).forEach(function (key) {
            keys.push(key);
        });
        keys.sort();
        let paramStringArray = [];
        keys.forEach(function (key) {
            paramStringArray.push(key + testCase.params[key]);
        });
        testCaseString += paramStringArray.join('');
    }
    return uuidv5(testCaseString, namespace);
} 

// Saves file to test case hash directory
module.exports.file = function (data, name) {
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)){
        fs.mkdirSync(tempDir);
    }
    const testDir = path.join(tempDir, hash());
    if (!fs.existsSync(testDir)){
        fs.mkdirSync(testDir);
    }
    fs.writeFileSync(path.join(testDir, name), data);
};

// Logs to console and adds message to log array for test case
module.exports.log = function (message, type) {
    const now = new Date();
    if (type !== "INFO" || type !== "ERROR" || type !== "WARNING") {
        type = "INFO";
    }
    const logMessage = "[" + now.toString() + "] [" + type + "] " + message;
    if (module.exports.console.log) {
        console.log(logMessage);
    }
    if (testFile !== undefined) {
        if (testFile.context !== undefined) {
            if (Array.isArray(testFile.context.expLog)) {
                testFile.context.expLog.push(logMessage);
            }
        }
    }
}

// Wait for use by async tests
module.exports.wait = async function (time) {
    const sleep = function (ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }
    await sleep(time);
}

// Returns files for the current test case
const files = function () {
    const tempDir = path.join(__dirname, 'temp');
    const testDir = path.join(tempDir, hash());
    let retFiles = [];
    let dirs = [testDir];
    while (dirs.length > 0) {
        let dir = dirs.pop();
        if (fs.existsSync(dir)){
            let files = fs.readdirSync(dir);
            for (let i = 0; i < files.length; i++) {
                let file = path.join(dir, files[i]);
                if (fs.lstatSync(file).isDirectory()) {
                    dirs.push(file);
                } else {
                    retFiles.push(path.join(dir, files[i]));
                }
            }
        }
    }
    return retFiles;
}

// Records result for the current test case
const recordResult = function () {
    try {
        totals.total += 1;
        let testCase = testFile.context;
        testCase.end = Date.now();
        if (testCase.result === undefined) {
            testCase.result = "pass";
            totals.pass += 1;
        } else if (testCase.result === "unknown") {
            totals.unknown += 1;
        } else {
            testCase.reason = testCase.result.toString();
            testCase.result = "fail";
            totals.fail += 1;
        }
        
        module.exports.log("End Test Name: " + testCase.name + ", Suite: " + (testCase.suite === undefined ? "" : testCase.suite) + " | RESULT -> " + testCase.result);
        if (testCase.result === "fail") {
            module.exports.log(testCase.reason);
        }
        
        if (testCase.expLog.length > 0) {
            module.exports.file(testCase.expLog.join("\r\n"), "test.log");
        }
        testCase.files = files();
        delete testCase.test;
        delete testCase.paramsList;
        delete testCase.expLog;
        results.cases.push(testCase);
    } catch (err) {
        module.exports.log(err)
    }
}

// Run the test in a guarded timeout
const runGuarded = async function (func, isAsync) {
    let timeout = defaultTimeout;
    if (suiteTimeout !== undefined) {
        if (isNaN(suiteTimeout) !== true) {
            timeout = suiteTimeout;
        }
    }
    if (testFile.context !== undefined) {
        if (testFile.context.timeout !== undefined) {
            if (isNaN(testFile.context.timeout) !== true) {
                timeout = testFile.context.timeout;
            }
        }
    }
    let result = 'unknown';
    let p1 = new Promise((resolve, reject) => setTimeout(() => {
        return resolve('timeout')
    }, timeout));
    let p2 = new Promise(async (resolve, reject) => {
        try {
            result = (isAsync === true) ? await func() : func();
        } catch (err) {
            result = err;
        } finally {
            resolve(result)
        }
    });
    
    try {
        await Promise.race([p1, p2]).then((value) => {
            result = value;
        }).catch((value) => {
            result = value;
        });
    } catch (err) {
        module.exports.log('Error: ' + err);
        return 'Error: ' + err;
    } finally {
        return result;
    }
}

// Prepares test for guarded run and then requests run
const runTest = async function () {
    try {
        let testCase = testFile.context;
        testFile.context.start = Date.now();
        module.exports.log("Start Test Name: " + testCase.name + ", Suite: " + (testCase.suite === undefined? "" : testCase.suite));
        if (testCase.test === undefined) {
            throw 'No test function in test case';
        }
        if (util.types.isAsyncFunction(testCase.test) === true) { // async/await or promise
            testFile.context.result = await runGuarded(testCase.test, true);
        } else if (testCase.test.length > 0) { // callback
            testFile.context.result = await runGuarded(util.promisify(testCase.test), true);
        } else { // synchronous
            testFile.context.result = await runGuarded(testCase.test, false);
        }
    } catch (err) {
        testFile.context.result = err;
    } finally {
        recordResult();
        testFile.context = {};
    }
}

// Runs test hooks
const runHook = async function (name) {
    let hook = undefined;
    if (testFile.hooks !== undefined) {
        if (testFile.hooks[name] !== undefined) {
            hook = testFile.hooks[name];
        }
    }
    if (hook === undefined) {
        return;
    }
    try {
        let result;
        if (util.types.isAsyncFunction(hook) === true) { // async async/promise
            result = await runGuarded(hook, undefined, true);
        } else if (hook.length > 0) { // async callback
            result = await runGuarded(util.promisify(hook), undefined, true);
        } else { // synchronous
            result = await runGuarded(hook, undefined, false);
        }
        if (result !== undefined) {
            module.exports.log('Error in hook ' + name + ":" + result);    
        }
    } catch (err) {
        module.exports.log('Error in hook ' + name + ":" + err);
    }
}

// Changes the context, i.e. the currently running test case
const initializeContext = function (testCase) {
    testFile.context = {};
    Object.keys(testCase).forEach(function (key) {
        testFile.context[key] = testCase[key];
    });
    testFile.context.result = "unknown";
    testFile.context.expLog = [];
}

// Starts a test file
const startTestFile = async function (testFileName) {
    if (testFile.cases === undefined) {
        return;
    } 
    try {
        try {
            if (testFile.timeout !== undefined) {
                if (isNaN(testFile.timeout) === true) {
                    suiteTimeout = defaultTimeout;        
                } else {
                    suiteTimeout = testFile.timeout;
                }
            }
        } catch (err) {
            suiteTimeout = defaultTimeout;
        }
        let suite = testFile.suite;
        await runHook("beforeAll");
        if (testFile.cases !== undefined) {
            for (let i = 0; i < testFile.cases.length; i++) {
                let c = testFile.cases[i];
                if (c.suite === undefined) {
                    c.suite = suite;
                }
                if (Array.isArray(c.paramsList)) {
                    for (let j = 0; j < c.paramsList.length; j++) {
                        initializeContext(c);
                        testFile.context.params = c.paramsList[j];
                        await runHook("beforeEach");
                        await runTest();
                        await runHook("afterEach");
                    }
                } else {
                    initializeContext(c);
                    await runHook("beforeEach");
                    await runTest();
                    await runHook("afterEach");
                }
            }
        }
        await runHook("afterAll");
    } catch (err) {
        module.exports.log('Error running test file ' + testFileName + ": " + err);
    }
}

// Finds test files for a set of given directories
const testFilesFinder = function (dirs) {
    let found = {};
    let testFiles = [];
    if (Array.isArray(dirs)) {
        while (dirs.length > 0) {
            let dir = dirs.pop();
            if (found[dir] !== undefined) {
                continue;
            } else {
                found[dir] = true;
            }
            try {
                let files = fs.readdirSync(dir);
                for (let i = 0; i < files.length; i++) {
                    let file = path.join(dir, files[i]);
                    if (fs.lstatSync(file).isDirectory()) {
                        if (files[i] !== "node_modules") {
                            dirs.push(file);
                        }
                    } else {
                        testFiles.push(file);
                    }
                }
            } catch (err) {
                module.exports.log('Error invalid dir supplied: ' + dir);
            }
        }
    }
    return testFiles;
}

// Start EXP
module.exports.start = async function () {
    if (started) {
        return;
    }
    started = true;
    module.exports.log('---- EXP START ----');
    module.exports.log('dirs: ' + module.exports.dirs);
    let testFiles = testFilesFinder(module.exports.dirs);
    if (Array.isArray(testFiles) !== true) {
        return "Test directories invalid."
    }
    if (testFiles.length === 0) {
        module.exports.log("No test files found, check dir arg");
    }
    for (let i = 0; i < testFiles.length; i++) {
        let testFileName = testFiles[i];
        try {
            testFile = require(testFileName);
            await startTestFile(testFileName);
        }
        catch (err) {
            // Expected if invalid file type
        }
    }
    
    module.exports.log("---- EXP END ---- ")
    module.exports.log("Pass: " + totals.pass);
    module.exports.log("Fail: " + totals.fail);
    module.exports.log("Unknown: " + totals.unknown);
    module.exports.log("Total: " + totals.total);
    
    if (module.exports.tesults.target !== undefined) {
        module.exports.log("Tesults results upload in progress...");
        
        const data = {
            target: module.exports.tesults.target,
            results: results
        }
        tesults.results(data, function (err, response) {
            module.exports.log("Tesults results upload complete");
            if (err) {
                module.exports.log('Error: ' + err);
                process.exit(0);
            } else {
                module.exports.log('Success: ' + response.success);
                module.exports.log('Message: ' + response.message);
                module.exports.log('Warnings: ' + response.warnings.length);
                module.exports.log('Errors: ' + response.errors.length);
                process.exit(0);
            }
        });
    } else {
        module.exports.log("Tesults disabled");
        process.exit(0);
    }
}