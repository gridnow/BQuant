const nj = require("numjs");
const macd = require("macd");

function corrcoef(x, y) {
    let std_x = nj.divide(nj.subtract(x, nj.mean(x)), nj.std(x));
    let std_y = nj.divide(nj.subtract(y, nj.mean(y)), nj.std(y));

    return nj.mean(nj.multiply(std_x, std_y));
}

exports.corrcoef = corrcoef;

const revertTemplates = [
    {
        vec: nj.array([1, 0.4, 0, 0]), // 上影线
        name: "上影线"
    }, {
        vec: nj.array([1, 0.5, 0.5, 0]), // 十字星
        name: "十字星"
    }, {
        vec: nj.array([1, 1, 0.6, 0]),
        name: "下影线"
    }
];

exports.matchRevert = function(o, c, h, l) {
    let bh, bl;
    if (c >= o) {
        bh = c;
        bl = o;
    } else {
        bh = o;
        bl = c;
    }
    let x = nj.array([h, bh, bl, l]);
    let max_i = 0;
    let max_val = corrcoef(x, revertTemplates[0].vec);

    for (let i = 1; i < revertTemplates.length; i++) {
        let y = revertTemplates[i].vec
        let t = corrcoef(x, y);

        if (t > max_val) {
            max_val = t;
            max_i = i;
        }
    }

    if (max_val < 0.95) {

        return {
            name: "无翻转",
            score: 0
        }
    }

    return {
        name: revertTemplates[max_i].name,
        score: max_val.toFixed(2)
    }
}

let _hpPartten = [1,1,1,1,1,1,1.001];

exports.testHP = function testHP(c, size) {
    let x = nj.array(c);
    const HPPartten = nj.array(_hpPartten.slice(_hpPartten.length - size));

    return corrcoef(x, HPPartten);
}

exports.MACD = function MACD(data, slow, fast, signal) {
    let macdResult = macd(data, slow, fast, signal);

    return {
        DIF: macdResult.MACD,
        DEA: macdResult.signal,
        MACD: macdResult.histogram 
    };
}

const CROSS_TYPE = {
    GOLDEN: 1,
    DEAD: -1,
    NONE: 0
};

exports.CROSS_TYPE = CROSS_TYPE;

exports.cross = function cross(prevFast, prevSlow, curFast, curSlow) {
    // 快线上穿慢线
    if (prevFast <= prevSlow && curFast >= curSlow) {
        return CROSS_TYPE.GOLDEN;
    }

    // 跨线下穿慢线
    if (prevFast >= prevSlow && curFast <= curSlow) {
        return CROSS_TYPE.DEAD;
    }

    return CROSS_TYPE.NONE;
}

/**
 * 计算列表的类加和
 * 
 * @param {number[]} vals 值列表
 */
function sum(vals) {
    let s = 0;
    for (let i = 0; i < vals.length; i++) {
        s += vals[i]
    }

    return s;
}

/**
 * 计算移动平均值
 * 
 * @param {number[]} c 收盘价列表
 * @param {number} p 周期
 * @return {number[]}
 */
function MA(c, p) {
    let result = new Array(c.length);
    result.fill(0);
 
    for (let i = p; i < c.length; i++) {
        result[i] = sum(c.slice(i - p, i)) / p;
    }
    
    return result;
}

exports.MA = MA;

/**
 * 找到周期内最小值索引，反向索引值
 * 
 * @param {number[]} c 价格列表
 * @param {number} p 周期
 * @return {number}
 */
function LLV_IDX(c, p) {
    let lowVal = c[c.length - p];
    let lowIdx = c.length - p;
    for (let i = c.length - p + 1; i < c.length; i++) {
        let v = c[i];
        if (v < lowVal) {
            lowVal = v;
            lowIdx = i;
        }
    }

    return c.length - lowIdx;
}

exports.LLV_IDX = LLV_IDX;

/**
 * 找到周期内最小值
 * 
 * @param {number[]} c 收盘价列表
 * @param {number} p 周期
 * @return {number}
 */
function LLV(c, p) {
    return Math.min(...c.slice(c.length - p, c.length));
}

exports.LLV = LLV;
/**
 * 找到周期内最大值索引，反向索引值
 * 
 * @param {number[]} c 价格列表
 * @param {number} p 周期
 * @return {number}
 */
function HHV_IDX(c, p) {
    let highVal = c[c.length - p];
    let highIdx = c.length - p;
    for (let i = highIdx + 1; i < c.length; i++) {
        let v = c[i];
        if (v > highVal) {
            highVal = v;
            highIdx = i;
        }
    }

    return c.length - highIdx;
}

exports.HHV_IDX = HHV_IDX;

/**
 * 找到周期内最大的值
 * @param {number[]} c 价格列表
 * @param {number} p 时间周期
 * @return {number}
 */
function HHV(c, p) {
    return Math.max(...c.slice(c.length - p, c.length));
}

exports.HHV = HHV;
