var gulp = require("gulp");
var path = require("path");
var child_process = require("child_process");
var runSequence = require("run-sequence");

var sourcePath = "./www";
var testPath = "./test";
var binPath = "./bin";
var tsFiles = "/**/*.ts";

var androidEmulatorName = "emulator";
var iOSEmulatorName = "iPhone 6s Plus (9.3) [";
var iOSSimulatorProcessName = "Simulator";
var emulatorReadyCheckDelay = 30 * 1000;
var emulatorMaxReadyAttempts = 5;

/* This message is appended to the compiled JS files to avoid contributions to the compiled sources.*/
var compiledSourceWarningMessage = "\n \
/******************************************************************************************** \n \
	 THIS FILE HAS BEEN COMPILED FROM TYPESCRIPT SOURCES. \n \
	 PLEASE DO NOT MODIFY THIS FILE AS YOU WILL LOSE YOUR CHANGES WHEN RECOMPILING. \n \
	 ALSO, PLEASE DO NOT SUBMIT PULL REQUESTS WITH CHANGES TO THIS FILE. \n \
	 INSTEAD, EDIT THE TYPESCRIPT SOURCES UNDER THE WWW FOLDER. \n \
	 FOR MORE INFORMATION, PLEASE SEE CONTRIBUTING.md. \n \
*********************************************************************************************/ \n\n\n";

/* TypeScript compilation parameters */
var tsCompileOptions = {
    "noImplicitAny": true,
    "noEmitOnError": true,
    "target": "ES5",
    "module": "commonjs",
    "sourceMap": false,
    "sortOutput": true,
    "removeComments": true
};

function spawnCommand(command, args, callback, silent, detached) {
    var options = {};
    if (detached) {
        options.detached = true;
        options.stdio = ["ignore"];
    }
    
    var process = child_process.spawn(command, args, options);

    process.stdout.on('data', function (data) {
        if (!silent) console.log("" + data);
    });

    process.stderr.on('data', function (data) {
        if (!silent) console.error("" + data);
    });

    if (!detached) {
        process.on('exit', function (code) {
            callback && callback(code === 0 ? undefined : "Error code: " + code);
        });
    }
    
    return process;
};

function execCommand(command, args, callback, silent) {
    var process = child_process.exec(command + " " + args.join(" "));

    process.stdout.on('data', function (data) {
        if (!silent) console.log("" + data);
    });

    process.stderr.on('data', function (data) {
        if (!silent) console.error("" + data);
    });
    
    process.on('exit', function (code) {
        callback && callback(code === 0 ? undefined : "Error code: " + code);
    });
    
    return process;
};

function runTests(callback, options) {
    var command = "mocha";
    var args = ["./bin/test"];
    if (options.android) args.push("--android");
    if (options.ios) {
        args.push("--ios");
        args.push("--use-wkwebview");
        args.push(options.wkwebview ? (options.uiwebview ? "both" : "true") : "false");
    }
    if (options.core) args.push("--core-tests");
    if (options.npm) args.push("--npm");
    execCommand(command, args, callback);
}

gulp.task("compile", function (callback) {
    runSequence("compile-src", "compile-test", callback);
});

gulp.task("compile-test", function () {
    var ts = require("gulp-typescript");
    var insert = require("gulp-insert");

    return gulp.src([testPath + tsFiles])
        .pipe(ts(tsCompileOptions))
        .pipe(insert.prepend(compiledSourceWarningMessage))
        .pipe(gulp.dest(path.join(binPath, testPath)));
});

gulp.task("compile-src", function () {
    var ts = require("gulp-typescript");
    var insert = require("gulp-insert");

    return gulp.src([sourcePath + tsFiles])
        .pipe(ts(tsCompileOptions))
        .pipe(insert.prepend(compiledSourceWarningMessage))
        .pipe(gulp.dest(path.join(binPath, sourcePath)));
});

gulp.task("tslint", function () {
    var tslint = require('gulp-tslint');

    // Configuration options adapted from TypeScript project:
    // https://github.com/Microsoft/TypeScript/blob/master/tslint.json

    var config = {
        "rules": {
            "class-name": true,
            "comment-format": [true,
                "check-space"
            ],
            "indent": [true,
                "spaces"
            ],
            "one-line": [true,
                "check-open-brace"
            ],
            "no-unreachable": true,
            "no-unused-variable": true,
            "no-use-before-declare": true,
            "quotemark": [true,
                "double"
            ],
            "semicolon": true,
            "whitespace": [true,
                "check-branch",
                "check-operator",
                "check-separator",
                "check-type"
            ],
            "typedef-whitespace": [true, {
                "call-signature": "nospace",
                "index-signature": "nospace",
                "parameter": "nospace",
                "property-declaration": "nospace",
                "variable-declaration": "nospace"
            }]
        }
    }

    return gulp.src([sourcePath + tsFiles, testPath + tsFiles])
        .pipe(tslint({ configuration: config }))
        .pipe(tslint.report("verbose"));
});

gulp.task("clean", function () {
    var del = require("del");
    return del([binPath + "/**"], { force: true });
});

gulp.task("default", function (callback) {
    runSequence("clean", "compile", "tslint", callback);
});

function startEmulators(callback, restartIfRunning, android, ios) {
    // called when an emulator is initialized successfully
    var emulatorsInit = 0;
    function onEmulatorInit(emulator) {
        ++emulatorsInit;
        console.log(emulator + " emulator is ready!");
        if (emulatorsInit === ((android ? 1 : 0) + (ios ? 1 : 0))) {
            console.log("All emulators are ready!");
            callback(undefined);
        }
    }
    
    // called to check if an Android emulator is initialized
    function androidEmulatorReady(onFailure) {
        console.log("Checking if Android emulator is ready yet...");
        // dummy command that succeeds if emulator is ready and fails otherwise
        spawnCommand("adb", ["shell", "pm", "list", "packages"], (code) => {
            if (!code) return onEmulatorInit("Android");
            else {
                console.log("Android emulator is not ready yet!");
                return onFailure();
            }
        }, true);
    }
    // called to check if an iOS emulator is initialized
    function iOSEmulatorReady(onFailure) {
        console.log("Checking if iOS emulator is ready yet...");
        // dummy command that succeeds if emulator is ready and fails otherwise
        spawnCommand("xcrun", ["simctl", "getenv", "booted", "asdf"], (code) => {
            if (!code) return onEmulatorInit("iOS");
            else {
                console.log("iOS emulator is not ready yet!");
                return onFailure();
            }
        }, true);
    }
    // kills the Android emulator then starts it
    function killThenStartAndroid() {
        spawnCommand("adb", ["emu", "kill"], () => {
            // emulator @emulator, which starts the android emulator, never returns, so we must check its success on another thread
            spawnCommand("emulator", ["@emulator"], undefined, false, true);
        
            var emulatorReadyAttempts = 0;
            function androidEmulatorReadyLooper() {
                ++emulatorReadyAttempts;
                if (emulatorReadyAttempts > emulatorMaxReadyAttempts)
                {
                    console.log("Android emulator is not ready after " + emulatorMaxReadyAttempts + " attempts, abort.");
                    androidProcess.kill();
                    return callback(1);
                }
                setTimeout(androidEmulatorReady.bind(undefined, androidEmulatorReadyLooper), emulatorReadyCheckDelay);
            }
            androidEmulatorReadyLooper();
        }, true);
    }
    // kills the iOS emulator then starts it
    function killThenStartIOS() {
        spawnCommand("killall", ["\"" + iOSSimulatorProcessName + "\""], () => {
            spawnCommand("xcrun", ["instruments", "-w", iOSEmulatorName], () => {
                var emulatorReadyAttempts = 0;
                function iOSEmulatorReadyLooper() {
                    ++emulatorReadyAttempts;
                    if (emulatorReadyAttempts > emulatorMaxReadyAttempts)
                    {
                        console.log("iOS emulator is not ready after " + emulatorMaxReadyAttempts + " attempts, abort.");
                        return callback(1);
                    }
                    setTimeout(iOSEmulatorReady.bind(undefined, iOSEmulatorReadyLooper), emulatorReadyCheckDelay);
                }
                iOSEmulatorReady(iOSEmulatorReadyLooper);
            });
        }, true);
    }
    if (!restartIfRunning) {
        if (android) {
            androidEmulatorReady(() => {
                killThenStartAndroid();
            });
        }
        if (ios) {
            iOSEmulatorReady(() => {
                killThenStartIOS();
            });
        }
    } else {
        if (android) killThenStartAndroid();
        if (ios) killThenStartIOS();
    }
    // This needs to be done so that the task will exit.
    // The command that creates the Android emulator persists with the life of the emulator and hangs this process unless we force it to quit.
    gulp.doneCallback = (err) => {
        process.exit(err ? 1 : 0);
    }
}

// procedurally generate tasks for every possible testing configuration
var cleanSuffix = "-clean";
var fastSuffix = "-fast";

// generate tasks for starting emulators
function generateEmulatorTasks(taskName, android, ios) {
    gulp.task(taskName, function (callback) {
        startEmulators(callback, false, android, ios);
    });
    
    gulp.task(taskName + cleanSuffix, function (callback) {
        startEmulators(callback, true, android, ios);
    });
}

function getEmulatorTaskNameSuffix(android, ios) {
    var emulatorTaskNameSuffix = "";
    
    if (android) emulatorTaskNameSuffix += "-android";
    if (ios) emulatorTaskNameSuffix += "-ios";
    // "emulator" instead of "emulator-android-ios"
    if (android && ios) emulatorTaskNameSuffix = "";
    
    return emulatorTaskNameSuffix
}

var emulatorTaskNamePrefix = "emulator";
for (var android = 0; android < 2; android++) {
    for (var ios = 0; ios < 4; ios++) {
        generateEmulatorTasks(emulatorTaskNamePrefix + getEmulatorTaskNameSuffix(android, ios), android, ios);
    }
}
                
function generateTestTasks(taskName, options) {
    gulp.task(taskName + "-fast", function (callback) {
        runTests(callback, options);
    });
    
    var emulatorTaskName = emulatorTaskNamePrefix + getEmulatorTaskNameSuffix(options.android, options.ios);
    
    gulp.task(taskName, function (callback) {
        runSequence("default", emulatorTaskName, taskName + fastSuffix, callback);
    });
    
    gulp.task(taskName + "-clean", function (callback) {
        runSequence("default", emulatorTaskName + cleanSuffix, taskName + fastSuffix, callback);
    });
}

// procedurally generate tasks for every possible testing configuration
var taskNamePrefix = "test";
for (var android = 0; android < 2; android++) {
    // 0 = don't run android tests
    // 1 = run android tests
    for (var ios = 0; ios < 4; ios++) {
        // 0 = don't run iOS tests
        // 1 = run iOS tests on UIWebView
        // 2 = run iOS tests on WKWebView
        // 3 = run iOS tests on both WebViews
        
        // must have at least one platform to be a test
        if (!android && !ios) continue;
        
        for (var core = 0; core < 2; core++) {
            // 0 = run all tests
            // 1 = run only core tests
            for (var npm = 0; npm < 2; npm++) {
                // 0 = run tests on local version of plugin
                // 1 = run tests on version of plugin from npm
                
                var taskName = taskNamePrefix;
                var taskNameSuffix = "";
                if (android) taskNameSuffix += "-android";
                if (ios) taskNameSuffix += "-ios";
                if (ios === 1) taskNameSuffix += "-uiwebview";
                if (ios === 2) taskNameSuffix += "-wkwebview";
                
                // "test" instead of "test-android-ios"
                if (android && ios === 3) taskNameSuffix = "";
                
                if (core) taskNameSuffix += "-core";
                if (npm) taskNameSuffix += "-npm";
                
                taskName += taskNameSuffix;
                
                var options = {};
                if (android) options.android = true;
                if (ios) options.ios = true;
                if (ios % 2 === 1) options.uiwebview = true;
                if (ios >= 2) options.wkwebview = true;
                if (core) options.core = true;
                if (npm) options.npm = true;
                
                generateTestTasks(taskName, options);
            }
        }
    }
}