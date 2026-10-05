const fs = require('fs');
const Module = require('module');

const originalLoad = Module._load;

Module._load = function (request, parent, isMain) {
    if (request === 'tesults') {
        return {
            results: function (data, callback) {
                if (process.env.EXP_UPLOAD_CAPTURE) {
                    fs.writeFileSync(process.env.EXP_UPLOAD_CAPTURE, JSON.stringify(data, null, 2));
                }

                callback(null, {
                    success: true,
                    message: 'mock upload complete',
                    warnings: [],
                    errors: []
                });
            }
        };
    }

    return originalLoad.call(this, request, parent, isMain);
};
