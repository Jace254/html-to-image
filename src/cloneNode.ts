/* eslint-disable no-console */
import { clonePseudoElements } from './clonePseudoElements'
import { getBlobFromURL } from './getBlobFromURL'
import { Options } from './options'
import { createImage, getMimeType, makeDataUrl, toArray } from './util'

async function cloneCanvasElement(node: HTMLCanvasElement) {
  const dataURL = node.toDataURL()
  if (dataURL === 'data:,') {
    return Promise.resolve(node.cloneNode(false) as HTMLCanvasElement)
  }

  return createImage(dataURL)
}

async function cloneVideoElement(node: HTMLVideoElement, options: Options) {
  return Promise.resolve(node.poster)
    .then((url) => getBlobFromURL(url, options))
    .then((data) =>
      makeDataUrl(data.blob, getMimeType(node.poster) || data.contentType),
    )
    .then((dataURL) => createImage(dataURL))
}

async function cloneSingleNode<T extends HTMLElement>(
  node: T,
  options: Options,
): Promise<HTMLElement> {
  if (node instanceof HTMLCanvasElement) {
    return cloneCanvasElement(node)
  }

  if (node instanceof HTMLVideoElement && node.poster) {
    return cloneVideoElement(node, options)
  }

  return Promise.resolve(node.cloneNode(false) as T)
}

const isSlotElement = (node: HTMLElement): node is HTMLSlotElement =>
  node.tagName != null && node.tagName.toUpperCase() === 'SLOT'

async function cloneChildren<T extends HTMLElement>(
  nativeNode: T,
  clonedNode: T,
  options: Options,
): Promise<T> {
  const children =
    isSlotElement(nativeNode) && nativeNode.assignedNodes
      ? toArray<T>(nativeNode.assignedNodes())
      : toArray<T>((nativeNode.shadowRoot ?? nativeNode).childNodes)

  if (children.length === 0 || nativeNode instanceof HTMLVideoElement) {
    return Promise.resolve(clonedNode)
  }

  return children
    .reduce(
      (deferred, child) =>
        deferred
          // eslint-disable-next-line no-use-before-define
          .then(() => cloneNode(child, options))
          .then((clonedChild: HTMLElement | null) => {
            // eslint-disable-next-line promise/always-return
            if (clonedChild) {
              clonedNode.appendChild(clonedChild)
            }
          }),
      Promise.resolve(),
    )
    .then(() => clonedNode)
}

function cloneCSSStyle<T extends HTMLElement>(nativeNode: T, clonedNode: T) {
  const source = window.getComputedStyle(nativeNode)
  const target = clonedNode.style

  if (!target) {
    return
  }

  // eslint-disable-next-line spaced-comment
  if (source.cssText) {
    target.cssText = source.cssText
  } else {
    toArray<string>(source).forEach((name) => {
      target.setProperty(
        name,
        source.getPropertyValue(name),
        source.getPropertyPriority(name),
      )
    })
  }

  const webkitBackgroundClip = source.getPropertyValue(
    '-webkit-background-clip',
  )
  if (webkitBackgroundClip !== 'border-box') {
    clonedNode.setAttribute(
      'style',
      `${clonedNode.getAttribute(
        'style',
      )};-webkit-background-clip:${webkitBackgroundClip};`,
    )
  }

  const fontFeatureSettings = source.getPropertyValue('font-feature-settings')
  if (fontFeatureSettings !== '"kern"') {
    clonedNode.setAttribute(
      'style',
      `${clonedNode.getAttribute(
        'style',
      )};font-feature-settings:${fontFeatureSettings};`,
    )
  }

  // fix text wrap issue
  if (nativeNode.tagName === 'P') {
    // apply on only <p>
    const { width } = getComputedStyle(nativeNode)
    if (width.includes('.')) {
      // width eg. 1.78px
      let floatWidth = parseFloat(width)
      if (floatWidth % 1 > 0.9) {
        floatWidth += 1
      }
      const newWidth = Math.ceil(floatWidth)
      clonedNode.setAttribute(
        'style',
        `${clonedNode.getAttribute('style')};width:${newWidth}px;`,
      )
    }
  }

  // fix for flex align bug in safari
  const alignItems = source.getPropertyValue('align-items')
  if (alignItems !== 'normal') {
    clonedNode.setAttribute(
      'style',
      `${clonedNode.getAttribute('style')};align-items:${alignItems};`,
    )
  }

  // fix for perspective bug in safari
  const perspective = source.getPropertyValue('perspective')
  if (perspective !== 'none') {
    clonedNode.setAttribute(
      'style',
      `${clonedNode.getAttribute('style')};perspective:${perspective};`,
    )
  }
}

function cloneInputValue<T extends HTMLElement>(nativeNode: T, clonedNode: T) {
  if (nativeNode instanceof HTMLTextAreaElement) {
    clonedNode.innerHTML = nativeNode.value
  }

  if (nativeNode instanceof HTMLInputElement) {
    clonedNode.setAttribute('value', nativeNode.value)
  }
}

async function decorate<T extends HTMLElement>(
  nativeNode: T,
  clonedNode: T,
): Promise<T> {
  if (!(clonedNode instanceof Element)) {
    return Promise.resolve(clonedNode)
  }

  return Promise.resolve()
    .then(() => cloneCSSStyle(nativeNode, clonedNode))
    .then(() => clonePseudoElements(nativeNode, clonedNode))
    .then(() => cloneInputValue(nativeNode, clonedNode))
    .then(() => clonedNode)
}

export async function cloneNode<T extends HTMLElement>(
  node: T,
  options: Options,
  isRoot?: boolean,
): Promise<T | null> {
  if (!isRoot && options.filter && !options.filter(node)) {
    return Promise.resolve(null)
  }

  return Promise.resolve(node)
    .then((clonedNode) => cloneSingleNode(clonedNode, options) as Promise<T>)
    .then((clonedNode) => cloneChildren(node, clonedNode, options))
    .then((clonedNode) => decorate(node, clonedNode))
}
