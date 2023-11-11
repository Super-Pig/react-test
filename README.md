[搭建 React 源码本地调试环境](#搭建React源码本地调试环境)

[React 架构](#React架构)

  - [Scheduler 调度层](#Scheduler调度层)

  - [Reconciler 协调层](#Reconciler协调层)

  - [Renderer 渲染层](#Renderer渲染层)

[数据结构](#数据结构)

  - [Fiber](#Fiber)

  - [WorkTag](#WorkTag)

  - [SideEffectTag](#SideEffectTag)

  - [TypeOfMode](#TypeOfMode)

  - [双缓存技术](#双缓存技术)

  - [区分 fiberRoot 与 rootFiber](#区分fiberRoot与rootFiber)

[初始化渲染](#初始化渲染)

  - [Render阶段](#Render阶段)

  - [Commit阶段](#Commit阶段)

# 搭建React源码本地调试环境

1. 使用 create-react-app 脚手架创建项目

`npx create-react-app react-test`

2. 弹射 create-react-app 脚手架内部配置

`npm run eject`

3. 克隆 react 官方源码（在项目的根目录下进行克隆）

`git clone --branch v16.13.1 --depth=1 https://github.com/facebook/react.git src/react`

4. 链接本地源码

```
// 文件位置：react-test/config/webpack.config.js

resolve: {
  alias: {
    "react-native": "react-native-web",
    "react": path.resolve(__dirname, "../src/react/packages/react"),
    "react-dom": path.resolve(__dirname, "../src/react/packages/react-dom"),
    "shared": path.resolve(__dirname, "../src/react/packages/shared"),
    "react-reconciler": path.resolve(__dirname, "../src/react/packages/react-reconciler"),
    "legacy-events": path.resolve(__dirname, "../src/react/packages/legacy-events")
  }
}
```

5. 修改环境变量

```
// 文件位置：react-test/config/env.js

const stringified = {
  "process.env": Object.keys(raw).reduce((env, key) => {
    env[key] = JSON.stringify(raw[key])
    
    return env
  }, {}),
  __DEV__: true,
  SharedArrayBuffer: true,
  spyOnDev: true,
  spyOnDevAndProd: true,
  spyOnProd: true,
  __UMD__: true,
  __EXPERIMENTAL__: true,
  __VARIANT__: true,
  gate: true,
  trustedTypes: true
}
```

6. 告诉 babel 在转换代码时忽略类型检查

`npm install @babel/plugin-transform-flow-strip-types -D`

```
// 文件位置：react-test/config/webpack.config.js [babel-loader]
plugins: [
  require.resolve('@babel/plugin-transform-flow-strip-types')
]
```

7. 导出 HostConfig

```
// 文件位置：/react/packages/react-reconciler/src/ReactFiberHostConfig.js

+ export * from './forks/ReactFiberHostConfig.dom';
- invariant(false, 'This module must be shimmed by a specific renderer.');
```

8. 修改 ReactSharedInternal.js 文件

```
文件位置：/react/packages/shared/ReactSharedInternals.js

- import * as React from 'react';
- const ReactSharedInternals = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
+ import ReactSharedInternals from '../react/src/ReactSharedInternals'
```

9. 关闭 eslint 扩展

```
// 文件位置：react/.eslintrc.js [module.exports]

// 删除 extends
extends: [
  'fbjs',
  'prettier'
]
```

10. 禁止 invariant 报错

```
// 文件位置：/react/packages/shared/invariant.js

export default function invariant(condition, format, a, b, c, d, e, f) {
  if (condition) return;

  throw new Error(
    'Internal React error: invariant() is meant to be replaced at compile ' +
    'time. There is no runtime version.',
  );
}
```

11. eslint 配置

在 react 源码文件夹中新建 .eslintrc.json 并添加如下配置

```
{
  "extends": "react-app",
  "globals": {
    "SharedArrayBuffer": true,
    "spyOnDev": true,
    "spyOnDevAndProd": true,
    "__PROFILE__": true,
    "__UMD__": true,
    "__EXPERIMENTAL__": true,
    "__VARIANT__": true,
    "gate": true,
    "trustedTypes": true
  }
}
```

12. 修改 react react-dom 引入方式

```
import * as React from 'react'
import * as ReactDOM from 'react-dom'
```

13. 解决 vsCode 中 flow 报错

```
"javascript.validate.enable": false
```

# 遇到问题及解决方案

> https://www.jianshu.com/p/a2bfe7ac28ea


# React架构

React 16 版本的架构可以分为三层：调度层、协调层、渲染层

- Scheduler（调度层）：调度任务的优先级，高优任务优先进入协调器

- Reconciler（协调层）：构建 Fiber 数据结构，比对 Fiber 对象找出差异，记录 Fiber 对象要进行的 DOM 操作

- Renderer（渲染层）：负责将发生变化的部分渲染到页面上

## Scheduler调度层

在 React 15 的版本中，采用了循环加递归的方式进行了 virtualDOM 的比对，由于递归使用 JavaScript 自身的执行栈，一旦开始就无法停止，直到任务完成。如果 virtualDOM 树的层级比较深，virtualDOM 的比对就会长期占用 JavaScript 主线程，由于 JavaScript 又是单线程的无法同时执行其他任务，所以在比对的过程中无法响应用户操作，无法即时执行元素动画，造成了页面卡顿的现象

在 React 16 的版本中，放弃了 JavaScript 递归的方式进行 virtualDOM 的比对，而是采用循环模拟递归。而且比对的过程是利用浏览器的空闲时间完成的，不会长期占用主线程，这就解决了 virtualDOM 对比造成页面卡顿的问题

在 window 对象中提供了 requestIdelCallback API，它可以利用浏览器的空闲时间执行任务，但是它自身也存在一些问题，比如说并不是所有的浏览器都支持它，而且它的触发频率也不是很稳定，所以 React 最终放弃了 requestIdelCallback 的使用

在 React 中，官方实现了自己的任务调度库，这个库叫做 Scheduler。它也可以实现在浏览器空闲时执行任务，而且还可以设置任务的优先级，高优先级任务先执行，低优先级任务后执行

Scheduler 存储在 packages/scheduler 文件夹中

## Reconciler协调层

在 React 15 的版本中，协调器和渲染器交替执行，即找到了差异就直接更新差异。在 React 16 的版本中，这种情况发生了变化，协调器和渲染器不再交替执行。协调器负责找出差异，在所有差异找出后，统一交给渲染器进行 DOM 的更新。也就是说协调器的主要任务就是找出差异部分，并为差异打上标记


## Renderer渲染层

渲染器根据协调器为 Fiber 节点打的标记，同步执行对应的 DOM 操作

既然对比的流程从递归变成了可以中断的循环，那么 React 是如何解决中断更新时 DOM 渲染不完全的问题呢？

其实根本就不存在这个问题，因为在整个过程中，调度器和协调器的工作是在内存中完成的是可以被打断的，渲染器的工作被设定成不可以被打断，所以不存在 DOM 渲染不完全的问题

# 数据结构

## Fiber

```
type Fiber = {
  /***** DOM 实例相关 **********/

  // 标记不同的组件类型，值详见 WorkTag
  tag: WorkTag,

  // 组件类型 - div、span、组件构造函数
  type: any,

  // 实例对象，如类组件的实例、原生 dom 实例，而 function 组件没有实例，因此该属性是空
  stateNode: any,

  /***** 构建 Fiber 树相关 *****/

  // 指向自己的父级 Fiber 对象
  return: Fiber | null,

  // 指向自己的第一个子级 Fiber 对象
  child: Fiber | null,

  // 指向自己的下一个兄弟 Fiber 对象
  sibling: Fiber | null,

  // 在 Fiber 树更新的过程中，每个 Fiber 都会有一个跟其对应的 Fiber
  // 我们称他为 current <===> workingInProgress
  // 在渲染完成之后他们会交换位置
  // alternate 指向当前 Fiber 在 workingInProgress 树中的对应 Fiber
  alternate: Fiber | null,

  /***** 状态数据相关 **********/

  // 即将更新的 props
  pendingProps: any,

  // 旧的 props
  memoizedProps: any,

  // 旧的 state
  memoizedState: any,

  /***** 副作用相关 ***********/

  // 该 Fiber 对应的组件产生的状态更新会存放在这个队列里面
  updateQueue: UpdateQueue<any> | null,

  // 用来记录当前 Fiber 要执行的 DOM 操作
  effectTag: SideEffectTag,

  // 子树中第一个 side effect
  firstEffect: Fiber | null,

  // 单链表用来快速查找下一个 side effect
  nextEffect: Fiber | null,

  // 子树中最后一个 side effect
  lastEffect: Fiber | null,

  // 任务的过期时间
  expirationTime: ExpirationTime,

  // 当前组件及子组件处于何种渲染模式
  // 详见 TypeOfMode
  mode: TypeOfMode
}
```

## WorkTag

文件位置：packages/shared/ReactWorkTag.js

## SideEffectTag

文件位置：packages/shared/ReactSideEffectTag.js

## TypeOfMode

文件位置：packages/react-reconciler/src/ReactTypeOfMode.js

## 双缓存技术

在 React 中，DOM 的更新采用了双缓存技术，双缓存技术致力于更快速的 DOM 更新

什么是双缓存？举个例子，使用 canvas 绘制动画时，在绘制每一帧前都会清除上一帧的画面，清除上一帧需要花费时间，如果当前帧画面计算量又比较大，又需要花费比较长的时间，这就导致上一帧清除到下一帧显示中间会有比较长的间隙，就会出现白屏

为了解决这个问题，我们可以在内存中绘制当前帧画面，绘制完毕后直接使用当前帧替换上一帧画面，这样的话在帧画面替换的过程中就会节约非常多的时间，就不会出现白屏问题。这种在内存中构建并直接替换的技术叫做双缓存

React 使用双缓存技术完成 Fiber 树的构建与替换，实现 DOM 对象的快速更新

在 React 中最多会同时存在两颗 Fiber 树，当前在屏幕中显示的内容对应的 Fiber 树叫做 current Fiber 树，当发生变更时，React 会在内存中重新构建一颗新的 Fiber 树，这颗正在构建的 Fiber 树叫做 workInProgress Fiber 树。在双缓存技术中，workInProgress Fiber 树就是即将要显示在页面中的 Fiber 树，当这颗 Fiber 树构建完成后，React 会使用它直接替换 current Fiber 树达到快速更新 DOM 的目的，因为 workInProgress Fiber 树是在内存中构建的所以构建它的速度是非常快的

一旦 workInProgress Fiber 树在屏幕上呈现，它就会变成 current Fiber 树

在 current Fiber 节点对象中又一个 alternate 属性指向对应的 workInProgress Fiber 节点对象，在 workInProgress Fiber 节点中有一个 alternate 属性也指向对应的 current Fiber 节点对象

## 区分fiberRoot与rootFiber

fiberRoot 表示 Fiber 数据结构对象，是 Fiber 数据结构中的最外层对象

rootFiber 表示组件挂载点对应的 Fiber 对象，比如 React 应用中默认的组件挂载点是 id 为 root 的 div

fiberRoot 包含 rootFiber, 在 fiberRoot 对象中又一个 current 属性，存储 rootFiber

rootFiber 指向 fiberRoot, 在 rootFiber 对象中有一个 stateNode 属性，指向 fiberRoot

在 React 应用中 fiberRoot 只有一个，而 rootFiber 可以有多个，因为 render 方法是可以调用多次的 

fiberRoot 会记录饮用中的更新信息，比如协调器在完成工作后，会将工作成果存储在 fiberRoot 中

# 初始化渲染

## Render阶段

### render

文件位置：packages/react-dom/src/client/ReactDOMLegacy.js

## Commit阶段

commit 阶段可以分为三个子阶段：

- before mutation 阶段（执行 DOM 操作前）
  - 处理类组件的 getSnapshotBeforeUpdate（更新阶段执行）
- mutation 阶段（执行 DOM 操作）
- layout 阶段（执行 DOM 操作后）
  - 类组件的生命周期函数 (componentDidMount, componentDidUpdate, componentWillUnmount)
  - 函数组件处理钩子函数

文件位置：packages/react-reconciler/src/ReactFiberWorkLoop.js