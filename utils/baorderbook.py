import websocket
import json
import threading
import time
from flask import Flask, jsonify
from flask_cors import CORS
import argparse

app = Flask(__name__)
CORS(app)

order_book = {
    'symbol': 'unknown',
    'lastUpdateId': 0,
    'bids': {},
    'asks': {}
}

def on_message(ws, message):
    data = json.loads(message)
    update_id = data['u']
    first_update_id = data['U']
    last_update_id = data['u']

    if order_book['lastUpdateId'] > 0 and first_update_id <= order_book['lastUpdateId']:
        return

    for bid in data['b']:
        price = float(bid[0])
        quantity = float(bid[1])
        if quantity == 0:
            if price in order_book['bids']:
                del order_book['bids'][price]
        else:
            order_book['bids'][price] = quantity

    for ask in data['a']:
        price = float(ask[0])
        quantity = float(ask[1])
        if quantity == 0:
            if price in order_book['asks']:
                del order_book['asks'][price]
        else:
            order_book['asks'][price] = quantity

    order_book['lastUpdateId'] = last_update_id

    print_order_book()

def on_error(ws, error):
    print(f"Error", error)

def on_close(ws):
    print("WebSocket closed")

def on_open(ws):
    print("WebSocket opened")

def print_order_book():
    count = 0
    print("Asks:")
    for price, quantity in sorted(order_book['asks'].items(), reverse=False):
        count += 1
        if count > 20:
            break
        print(f"Price: {price}, Quantity: {quantity}")
    print("\nBids:")
    count = 0
    for price, quantity in sorted(order_book['bids'].items(), reverse=True): 
        count += 1
        if count > 20:
            break
        print(f"Price: {price}, Quantity: {quantity}")
    print("\n")

def run_websocket():
    ws = websocket.WebSocketApp(WEBSOCKET_URL,
                                on_message=on_message,
                                on_error=on_error,
                                on_close=on_close)
    ws.on_open = on_open
    ws.run_forever()

@app.route('/get_orderbook', methods=['GET'])
def get_array():
    # 返回数组序列
    # 只返回最高价格的 1000 档 asks 和最低价格的 1000 档 bids
    order_book['asks'] = dict(sorted(order_book['asks'].items(), key=lambda x: x[0], reverse=False)[:50])
    order_book['bids'] = dict(sorted(order_book['bids'].items(), key=lambda x: x[0], reverse=True)[:50])
    return jsonify(order_book)

def run_websocket(symbol):
    order_book['symbol'] = symbol
    websocket_url = f"wss://stream.binance.com:9443/ws/{symbol.lower()}@depth"
    print("Linkage to ", websocket_url)
    ws = websocket.WebSocketApp(websocket_url,
                                on_message=on_message,
                                on_error=on_error,
                                on_close=on_close)
    ws.on_open = on_open
    ws.run_forever()
if __name__ == "__main__":
    # 解析命令行参数
    parser = argparse.ArgumentParser(description='Binance Order Book Service')
    parser.add_argument('symbol', type=str, help='Trading symbol (e.g., BTCUSDT)')
    args = parser.parse_args()

    # 启动 WebSocket 线程
    websocket_thread = threading.Thread(target=run_websocket, args=(args.symbol,))
    websocket_thread.start()

    # 启动 Flask 应用，并设置 IP 地址为 0.0.0.0，端口为 50003
    app.run(debug=True, host='0.0.0.0', port=50003)
