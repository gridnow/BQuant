# BQuant
数字货币策略框架，目前基于币安，可以在此基础上对接各种自动化交易、自动化止盈止损策略。

## 目录说明
js - 币安合约接口封装，包括多空双方的买卖接口，消息推送接口，行情订阅接口等
stg_stop - 一个止损策略

## 使用说明
nodejs stg_stop/wuxin_trader.js

## 配置
1,js/bapi.js 中币安API KEY 的配置，请填上您自己的API KEY 和密码
2,js/bapi.js 中有测试环境和真实环境的配置，如果策略还在开发阶段可以用测试环境的假钱进行验证

## 其它
有任何问题欢迎交流，微信qinmo54
打赏也很关键，USDT地址（TRC20）:TDZirf5DCDwuRhutgjBfbVzPKCGstxduXx
