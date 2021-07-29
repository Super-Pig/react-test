# 搭建 React 源码本地调试环境

1. 使用 create-react-app 脚手架创建项目

`npx create-react-app react-test`

2. 弹射 create-react-app 脚手架内部配置

`npm run eject`

3. 克隆 react 官方源码（在项目的根目录下进行克隆）

`git clone --branch v16.13.1 --depth=1 https://github.com/facebook/react.git src/react`