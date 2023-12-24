const api = require('kucoin-futures-node-api');
const express = require('express');
const fs = require("fs");
const bapi = require('./bapi');
const ta = require("./ta");
//const stra = require("./strategy");

const app = express()
const port = 50004

app.set('views', './views');
app.set('view engine', 'pug');
app.use(express.static('./statics'));

const config = {
  environment: 'live'
}

const apiLive = new api()
apiLive.init(config)

function calc_rise(klinedata) {
  let ret = []
  for (let i = 1; i < klinedata.length; i++) {
    let pc = klinedata[i - 1][2];
    let c = klinedata[i][2];

    ret.push( (c - pc) / pc);
  }
  return ret
}

app.get('/flist', async (req, res) => {
  let granularity = parseInt(req.query.time) || 15;
  let ret = await apiLive.getAllContracts()
  let k = []
  var start = new Date().getTime();

  let requests = ret.data.map((f)=> {
    return apiLive.getKlines({
      symbol: f.symbol,
      granularity: granularity
    }).then((ret) => {
        return {
              data: ret.data,
              symbol: f.symbol
        }
    });
  })

  try{
    const klineDatas = await Promise.all(requests);
    var end = new Date().getTime();
    var time = end - start;
    console.log('Execution time: ' + time);

    for(const _k of klineDatas) {
      let symbol = _k.symbol;
      let klineData = _k.data;
      if (klineData.length < 10) {
        continue;
      }
  
      let subkline = klineData.splice(klineData.length - 10)
      let rise_list = calc_rise(subkline)
      let rise = Math.round(rise_list[rise_list.length - 2] * 10000) / 100
  
      k.push({symbol, rise});
    }
  }catch(e) {
    console.log("api call ku error ", e)
  }

  k = k.sort((a, b) => {
    return a.rise - b.rise;
  });
  
  res.render('index', {platform: 'Kucoin', lists: k, time: granularity});
})

function calc_rise_b(klinedata) {
  let ret = []
  for (let i = 1; i < klinedata.length; i++) {
    let pc = klinedata[i - 1][4];
    let c = klinedata[i][4];

    ret.push( (c - pc) / pc);
  }
  return ret
}

app.get('/blist', async (req, res) => {
  let granularity = req.query.time || '15m';
  let orderby = req.query.orderby || "0";
  let needjson = req.query.needjson || "0";
  let hpParam = parseInt(req.query.hp) || 3;
  if (hpParam < 3) {
    hpParam = 3;
  } else if (hpParam > 7) {
    hpParam = 7;
  }
  let ret = await bapi.getAllContracts();
  const symbols = ret.data.filter(s => !s.symbol.endsWith("BUSD"))
  let k = []
  var start = new Date().getTime();

  let requests = symbols.map((f)=> {
    return bapi.getKlines({
      symbol: f.symbol,
      time: granularity
    }).then((ret) => {
        return {
              data: ret.data,
              symbol: f.symbol,
              quantityPrecision: f.quantityPrecision, 
              pricePrecision: f.pricePrecision
        }
    });
  })

  try{
    const klineDatas = await Promise.all(requests);
    var end = new Date().getTime();
    var time = end - start;
    console.log('Execution time: ' + time);

    for(const _k of klineDatas) {
      /** @type {string} */
      let symbol = _k.symbol;
      let klineData = _k.data;
      if (klineData.length < 10) {
        continue;
      }
  
      let subkline = klineData.splice(klineData.length - 10);
      let rise_list = calc_rise_b(subkline);
      let rise1 = Math.round(rise_list[rise_list.length - 2] * 10000) / 100;
      let rise0 = Math.round(rise_list[rise_list.length - 1] * 10000) / 100;

      let kline1 = subkline[subkline.length - 2];
      if ((!kline1) || (!kline1[0])) {
        continue;
      }

      let kline0 = subkline[subkline.length - 1];

      let revert1 = ta.matchRevert(parseFloat(kline1[1]), parseFloat(kline1[4]), parseFloat(kline1[2]), parseFloat(kline1[3]));
      let revert0 = ta.matchRevert(parseFloat(kline0[1]), parseFloat(kline0[4]), parseFloat(kline0[2]), parseFloat(kline0[3]));
  
      let hp = ta.testHP(subkline.slice(subkline.length - hpParam).map(r => parseFloat(r[4])), hpParam);

      k.push({symbol, rise1, rise0, revert1, revert0, hpscore: hp.toFixed(3), close: kline0[4], quantityPrecision: _k.quantityPrecision, pricePrecision: _k.pricePrecision});
    }
  }catch(e) {
    console.log("api call bapi error ", e)
  }
  if (orderby === "0") {
    k = k.sort((a, b) => {
      return b.rise0 - a.rise0;
    });
  } else {
    k = k.sort((a, b) => {
      return a.rise1 - b.rise1;
    });
  }
  
  if (needjson == "1") {
    res.json(k);
  } else {
    res.render('index', {platform: 'Bian', lists: k, time: granularity});
  }
  
  
})

app.get('/btj', async (req, res) => {
  let hpParam = parseInt(req.query.hp) || 3;
  if (hpParam < 3) {
    hpParam = 3;
  } else if (hpParam > 7) {
    hpParam = 7;
  }
  let ret = await bapi.getAllContracts();
  const symbols = ret.data.filter(s => !s.symbol.endsWith("BUSD"))
  let k = []
  let symbol_to_k_map = {}

  let requests_15m = symbols.map((f)=> {
    return bapi.getKlines({
      symbol: f.symbol,
      time: '15m'
    }).then((ret) => {
        symbol_to_k_map[f.symbol + '_15m'] = ret.data;
        return {
              data: ret.data,
              symbol: f.symbol
        }
    });
  })
  
  let requests_1h = symbols.map((f)=> {
    return bapi.getKlines({
      symbol: f.symbol,
      time: '1h'
    }).then((ret) => {
        symbol_to_k_map[f.symbol + '_1h'] = ret.data;
        return {
              data: ret.data,
              symbol: f.symbol
        }
    });
  })


  try{
    const klineDatas_15m = await Promise.all(requests_15m);
    const klineDatas_1h = await Promise.all(requests_1h);

    for(const _k of symbols) {
      /** @type {string} */
      let symbol = _k.symbol;
      let klineData_15m = symbol_to_k_map[symbol + '_15m'];
      let klineData_1h = symbol_to_k_map[symbol + '_1h'];
      if (klineData_15m.length < 10) {
        continue;
      }
      if (klineData_1h.length < 10) {
        continue;
      }

      let subkline_15m = klineData_15m.splice(klineData_15m.length - 10);
      let subkline_1h = klineData_1h.splice(klineData_1h.length - 10);
      let lxzd = new stra.LXZD(subkline_15m, subkline_1h);
      let tj = lxzd.select()
      if(tj.side !== "none") {
        k.push({symbol, tj});
      }
    }
  }catch(e) {
    console.log("api call bapi error ", e)
  }
  
  res.render('tj', {platform: 'Bian', lists: k, time: '15m/1h'});
})


app.get("/blist/pi", async (req, res) => {
  let pi = await bapi.getPremiumIndex();

  pi = pi.sort((a, b) => {
    return Math.abs(parseFloat(b.lastFundingRate)) - Math.abs(parseFloat(a.lastFundingRate));
  });

  pi = pi.map(p => {
    let np = {...p};
    np.lastFundingRate = `${(parseFloat(p.lastFundingRate) * 100).toFixed(2)}%`;
    return np;
  });

  res.render("pi", {platform: 'Bian', lists: pi});
});


app.get("/blist/vol", async(req, res) => {
  let ret = await bapi.getAllContracts();
  const symbols = ret.data.filter(s => !s.symbol.endsWith("BUSD"));

  let requests15Min = symbols.map((f)=> {
    return bapi.getKlines({
      symbol: f.symbol,
      time: '15m'
    }).then((ret) => {
        return {
              data: ret.data,
              symbol: f.symbol
        }
    });
  });

  const klineDatas = await Promise.all(requests15Min);
  /** @type {{symbol: string, qr: number}[]} */
  const results = [];

  for (let {symbol, data: klineData} of klineDatas) {
    let subKline = klineData.slice(klineData.length - 12, klineData.length - 2);
    let vols = parseFloat(subKline[subKline.length - 1][5]);
    let avg = subKline.slice(0, subKline.length - 1).reduce((p, c) => {
      return p + parseFloat(c[5]);
    }, 0) / subKline.length - 1;

    results.push({
      symbol,
      qr: vols / avg
    });
  }

  results.sort((a, b) => {
    return b.qr - a.qr
  });

  res.render("vol", {platform: 'Bian', lists: results});
})

app.get("/blist/strategy", async (req, res) => {

});



app.listen(port, '0.0.0.0', () => {
  console.log(`Example app listening on port ${port}`)
})
