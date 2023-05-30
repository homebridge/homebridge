const items = require('../config.json');

function checkId(obj) {
    if (!Array.isArray(obj) && typeof obj != 'object') return [];
    if (obj['id'] && obj['name']) return [{id: obj['id'], name: obj['name']}];

    let pairs = [];
    for (let k in obj) {
        if (typeof obj[k] == 'object' && obj[k] !== null) {
            let pair = checkId(obj[k]);
            if (pair.length) pairs.push(...pair);
        }
    }
    return pairs;
}

module.exports = {
    checkId: checkId(items),
};
