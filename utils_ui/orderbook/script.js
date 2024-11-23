// 基于准备好的 DOM，初始化 ECharts 实例
var orderbookChart = echarts.init(document.getElementById('main'));
var valueChart = echarts.init(document.getElementById('valueChart'));
var volumeChart = echarts.init(document.getElementById('volumeChart'));

// 从接口获取数据
function fetchData() {
    return $.ajax({
        url: 'http://ecs:50003/get_orderbook', // 替换为你的接口地址
        method: 'GET',
        success: function (response) {
            return response;
        },
        error: function (error) {
            console.error('Error fetching data:', error);
        }
    });
}
// 保存当前的缩放状态
function saveZoomState() {
    var opt = orderbookChart.getOption();
    if (!opt)
        return;
    var zoomState = orderbookChart.getOption().dataZoom[0];
    console.log("zoom state", zoomState)
    return zoomState;
}

// 恢复缩放状态
function restoreZoomState(zoomState) {
    if (!zoomState)
        return;

    orderbookChart.setOption({
        dataZoom: [zoomState]
    });
}


// 计算买盘和卖盘的总量和总价值
function calculateTotals(bids, asks) {
    var totalBuyVolume = 0;
    var totalBuyValue = 0;
    var totalSellVolume = 0;
    var totalSellValue = 0;

    Object.entries(bids).forEach(([price, quantity]) => {
        totalBuyVolume += quantity;
        totalBuyValue += price * quantity;
    });

    Object.entries(asks).forEach(([price, quantity]) => {
        totalSellVolume += quantity;
        totalSellValue += price * quantity;
    });

    return {
        totalBuyVolume,
        totalBuyValue,
        totalSellVolume,
        totalSellValue
    };
}

// 存储历史数据
var valueHistory = {
    totalBuyValue: [],
    totalSellValue: []
};

var volumeHistory = {
    totalBuyVolume: [],
    totalSellVolume: []
};

// 更新图表
function updateChart(orderBook) {
    var bids = orderBook.bids;
    var asks = orderBook.asks;

    var buyPrices = Object.keys(bids).map(parseFloat);
    var sellPrices = Object.keys(asks).map(parseFloat);
    var buyQuantities = Object.values(bids).map(parseFloat);
    var sellQuantities = Object.values(asks).map(parseFloat);

    var totals = calculateTotals(bids, asks);
    var option = {
        title: {
            text: 'Price vs Quantity Histogram for ' + orderBook.symbol
        },
        tooltip: {
            trigger: 'axis',
            axisPointer: {
                type: 'shadow'
            },
            formatter: function (params) {
                var tooltip = 'Price: $' + params[0].axisValue + '<br/>';
                params.forEach(function (param) {
                    tooltip += param.seriesName + ': ' + param.value[1] + '<br/>';
                });
                return tooltip;
            }
        },
        dataZoom: [
            {
                type: 'inside',
                start: 0,
                end: 100
            },
            {
                start: 0,
                end: 100
            }
        ],
        graphic: [
            {
                type: 'text',
                left: 'center',
                top: '5%',
                style: {
                    text: `Total Buy Volume: ${totals.totalBuyVolume.toFixed(2)}, Total Buy Value: $${totals.totalBuyValue.toFixed(2)}`,
                    fontSize: 14,
                    fill: '#333'
                }
            },
            {
                type: 'text',
                left: 'center',
                top: '10%',
                style: {
                    text: `Total Sell Volume: ${totals.totalSellVolume.toFixed(2)}, Total Sell Value: $${totals.totalSellValue.toFixed(2)}`,
                    fontSize: 14,
                    fill: '#333'
                }
            }
        ],
        xAxis: {
            type: 'value',
            name: 'Price',
            axisLabel: {
                formatter: function (value) {
                    return '$' + value;
                }
            }
        },
        yAxis: {
            type: 'value',
            name: 'Quantity'
        },
        series: [
            {
                name: 'Buy Quantity',
                type: 'bar',
                data: buyPrices.map((price, index) => [price, buyQuantities[index]]),
                itemStyle: {
                    color: 'green'
                }
            },
            {
                name: 'Sell Quantity',
                type: 'bar',
                data: sellPrices.map((price, index) => [price, sellQuantities[index]]),
                itemStyle: {
                    color: 'red'
                }
            }
        ]
    };

    // 保存当前的缩放状态
    var zoomState = saveZoomState();
    // 使用刚指定的配置项和数据显示图表。
    orderbookChart.setOption(option);
    // 恢复缩放状态
    restoreZoomState(zoomState);

    // 更新总价值曲线图，先存内存
    valueHistory.totalBuyValue.push(totals.totalBuyValue);
    valueHistory.totalSellValue.push(totals.totalSellValue);

    // 更新总价值曲线图
    var valueChartOption = {
        title: {
            text: 'Total Buy/Sell Value'
        },
        tooltip: {
            trigger: 'axis',
            axisPointer: {
                type: 'line'
            }
        },
        xAxis: {
            type: 'category',
            data: valueHistory.totalBuyValue.map((_, index) => index)
        },
        yAxis: {
            type: 'value',
            name: 'Total Value',
            axisLabel: {
                formatter: function (value) {
                    return '$' + value;
                }
            }
        },
        series: [
            {
                name: 'Total Buy Value',
                type: 'line',
                showSymbol: false,
                data: valueHistory.totalBuyValue,
                itemStyle: {
                    color: 'green'
                }
            },
            {
                name: 'Total Sell Value',
                type: 'line',
                showSymbol: false,
                data: valueHistory.totalSellValue,
                itemStyle: {
                    color: 'red'
                }
            }
        ]
    };

    valueChart.setOption(valueChartOption);

    // 更新总量曲线图
    volumeHistory.totalBuyVolume.push(totals.totalBuyVolume);
    volumeHistory.totalSellVolume.push(totals.totalSellVolume);

    // 更新总量曲线图
    var volumeChartOption = {
        title: {
            text: 'Total Buy/Sell Volume'
        },
        tooltip: {
            trigger: 'axis',
            axisPointer: {
                type: 'line'
            }
        },
        xAxis: {
            type: 'category',
            data: volumeHistory.totalBuyVolume.map((_, index) => index)
        },
        yAxis: {
            type: 'value',
            name: 'Total Volume'
        },
        series: [
            {
                name: 'Total Buy Volume',
                type: 'line',
                showSymbol: false,
                data: volumeHistory.totalBuyVolume,
                itemStyle: {
                    color: 'green'
                }
            },
            {
                name: 'Total Sell Volume',
                type: 'line',
                showSymbol: false,
                data: volumeHistory.totalSellVolume,
                itemStyle: {
                    color: 'red'
                }
            }
        ]
    };

    volumeChart.setOption(volumeChartOption);
    
}

// 每秒从接口获取数据并更新图表
setTimeout(async function () {
    try {
        var response = await fetchData();
        updateChart(response); // 假设接口返回的数据格式为 { order_book: {...} }
    } catch (error) {
        console.error('Error updating chart:', error);
    }
}, 1);


// 每秒从接口获取数据并更新图表
setInterval(async function () {
    try {
        var response = await fetchData();
        updateChart(response); // 假设接口返回的数据格式为 { order_book: {...} }
    } catch (error) {
        console.error('Error updating chart:', error);
    }
}, 3000);

// 监听窗口大小变化，动态调整图表宽度
window.addEventListener('resize', function () {
    orderbookChart.resize();
    valueChart.resize();
    volumeChart.resize();
});