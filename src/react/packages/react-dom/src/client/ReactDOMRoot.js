/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Container} from './ReactDOMHostConfig';
import type {RootTag} from 'shared/ReactRootTags';
import type {ReactNodeList} from 'shared/ReactTypes';
// TODO: This type is shared between the reconciler and ReactDOM, but will
// eventually be lifted out to the renderer.
import type {FiberRoot} from 'react-reconciler/src/ReactFiberRoot';
import {findHostInstanceWithNoPortals} from 'react-reconciler/inline.dom';

export type RootType = {
  render(children: ReactNodeList): void,
  unmount(): void,
  _internalRoot: FiberRoot,
  ...
};

export type RootOptions = {
  hydrate?: boolean,
  hydrationOptions?: {
    onHydrated?: (suspenseNode: Comment) => void,
    onDeleted?: (suspenseNode: Comment) => void,
    ...
  },
  ...
};

import {
  isContainerMarkedAsRoot,
  markContainerAsRoot,
  unmarkContainerAsRoot,
} from './ReactDOMComponentTree';
import {eagerlyTrapReplayableEvents} from '../events/ReactDOMEventReplaying';
import {
  ELEMENT_NODE,
  COMMENT_NODE,
  DOCUMENT_NODE,
  DOCUMENT_FRAGMENT_NODE,
} from '../shared/HTMLNodeType';

import {createContainer, updateContainer} from 'react-reconciler/inline.dom';
import invariant from 'shared/invariant';
import {BlockingRoot, ConcurrentRoot, LegacyRoot} from 'shared/ReactRootTags';

function ReactDOMRoot(container: Container, options: void | RootOptions) {
  this._internalRoot = createRootImpl(container, ConcurrentRoot, options);
}

function ReactDOMBlockingRoot(
  container: Container,
  tag: RootTag,
  options: void | RootOptions,
) {
  // tag => 0 => legacyRoot
  // container => <div id='root'></div>
  // container._reactRootContainer = {_internalRoot: {}}
  
  this._internalRoot = createRootImpl(container, tag, options);
}

ReactDOMRoot.prototype.render = ReactDOMBlockingRoot.prototype.render = function(
  children: ReactNodeList,
): void {
  const root = this._internalRoot;
  if (__DEV__) {
    if (typeof arguments[1] === 'function') {
      console.error(
        'render(...): does not support the second callback argument. ' +
          'To execute a side effect after rendering, declare it in a component body with useEffect().',
      );
    }
    const container = root.containerInfo;

    if (container.nodeType !== COMMENT_NODE) {
      const hostInstance = findHostInstanceWithNoPortals(root.current);
      if (hostInstance) {
        if (hostInstance.parentNode !== container) {
          console.error(
            'render(...): It looks like the React-rendered content of the ' +
              'root container was removed without using React. This is not ' +
              'supported and will cause errors. Instead, call ' +
              "root.unmount() to empty a root's container.",
          );
        }
      }
    }
  }
  updateContainer(children, root, null, null);
};

ReactDOMRoot.prototype.unmount = ReactDOMBlockingRoot.prototype.unmount = function(): void {
  if (__DEV__) {
    if (typeof arguments[0] === 'function') {
      console.error(
        'unmount(...): does not support a callback argument. ' +
          'To execute a side effect after rendering, declare it in a component body with useEffect().',
      );
    }
  }
  const root = this._internalRoot;
  const container = root.containerInfo;
  updateContainer(null, root, null, () => {
    unmarkContainerAsRoot(container);
  });
};

function createRootImpl(
  container: Container,
  tag: RootTag,
  options: void | RootOptions,
) {
  // Tag is either LegacyRoot or Concurrent Root
  // container => <div id='root'></div>
  // tag => 0
  // options => undefined
  // 检测是否为服务端渲染 false
  const hydrate = options != null && options.hydrate === true;

  // 服务端渲染相关 null
  const hydrationCallbacks =
    (options != null && options.hydrationOptions) || null;

  const root = createContainer(container, tag, hydrate, hydrationCallbacks);
  
  markContainerAsRoot(root.current, container);
  
  // 服务端渲染相关
  if (hydrate && tag !== LegacyRoot) {
    const doc =
      container.nodeType === DOCUMENT_NODE
        ? container
        : container.ownerDocument;
    eagerlyTrapReplayableEvents(container, doc);
  }
  return root;
}

export function createRoot(
  container: Container,
  options?: RootOptions,
): RootType {
  invariant(
    isValidContainer(container),
    'createRoot(...): Target container is not a DOM element.',
  );
  warnIfReactDOMContainerInDEV(container);
  return new ReactDOMRoot(container, options);
}

export function createBlockingRoot(
  container: Container,
  options?: RootOptions,
): RootType {
  invariant(
    isValidContainer(container),
    'createRoot(...): Target container is not a DOM element.',
  );
  warnIfReactDOMContainerInDEV(container);
  return new ReactDOMBlockingRoot(container, BlockingRoot, options);
}

/**
 * 通过实例化 ReactDOMBlockingRoot 类创建 LegacyRoot
 * @param {*} container 
 * @param {*} options 
 * @returns 
 */
export function createLegacyRoot(
  container: Container,
  options?: RootOptions,
): RootType {
  // container => <div id='root'></div>
  // LegacyRoot 常量，值为 0
  // 通过 render 方法创建的 container 就是 LegacyRoot
  return new ReactDOMBlockingRoot(container, LegacyRoot, options);
}

/**
 * 判断 node 是否是符合要求的 DOM 节点
 * @param {*} node 
 * @returns 
 * 
 * 1. node 可以是元素节点
 * 2. node 可以是 document 节点
 * 3. node 可以是文档碎片节点
 * 4. node 可以是注释节点，但注释内容必须是 react-mount-point-unstable
 *    react 内部会找到注释节点的父级，通过调用父级元素的 insertBefore 方法将 element 插入到注释节点的前面
 */
export function isValidContainer(node: mixed): boolean {
  return !!(
    node &&
    (node.nodeType === ELEMENT_NODE ||
      node.nodeType === DOCUMENT_NODE ||
      node.nodeType === DOCUMENT_FRAGMENT_NODE ||
      (node.nodeType === COMMENT_NODE &&
        (node: any).nodeValue === ' react-mount-point-unstable '))
  );
}

function warnIfReactDOMContainerInDEV(container) {
  if (__DEV__) {
    if (
      container.nodeType === ELEMENT_NODE &&
      ((container: any): Element).tagName &&
      ((container: any): Element).tagName.toUpperCase() === 'BODY'
    ) {
      console.error(
        'createRoot(): Creating roots directly with document.body is ' +
          'discouraged, since its children are often manipulated by third-party ' +
          'scripts and browser extensions. This may lead to subtle ' +
          'reconciliation issues. Try using a container element created ' +
          'for your app.',
      );
    }
    if (isContainerMarkedAsRoot(container)) {
      if (container._reactRootContainer) {
        console.error(
          'You are calling ReactDOM.createRoot() on a container that was previously ' +
            'passed to ReactDOM.render(). This is not supported.',
        );
      } else {
        console.error(
          'You are calling ReactDOM.createRoot() on a container that ' +
            'has already been passed to createRoot() before. Instead, call ' +
            'root.render() on the existing root instead if you want to update it.',
        );
      }
    }
  }
}
