'use client';

import { useEffect } from 'react';
import type { SupportedLanguage } from '@/lib/localization';
import { translateUiText } from '@/lib/ui-translations';

const originalText = new WeakMap<Text, string>();
const appliedText = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Map<string, string>>();
const appliedAttributes = new WeakMap<Element, Map<string, string>>();
const LOCALIZED_ATTRIBUTES = ['aria-label', 'placeholder', 'title'] as const;

function isExcluded(node: Node): boolean {
  const parent = node instanceof Element ? node : node.parentElement;
  return Boolean(parent?.closest('script, style, code, pre, textarea, [contenteditable="true"], [data-no-translate], .notranslate'));
}

function localizeTextNode(node: Text, language: SupportedLanguage) {
  if (isExcluded(node)) return;
  const current = node.data;
  const lastApplied = appliedText.get(node);
  if (!originalText.has(node) || (lastApplied !== undefined && current !== lastApplied)) {
    originalText.set(node, current);
  }
  const translated = translateUiText(language, originalText.get(node) ?? current);
  appliedText.set(node, translated);
  if (current !== translated) node.data = translated;
}

function localizeElementAttributes(element: Element, language: SupportedLanguage) {
  if (isExcluded(element)) return;
  const originals = originalAttributes.get(element) ?? new Map<string, string>();
  const applied = appliedAttributes.get(element) ?? new Map<string, string>();
  for (const attribute of LOCALIZED_ATTRIBUTES) {
    const current = element.getAttribute(attribute);
    if (current == null) continue;
    const lastApplied = applied.get(attribute);
    if (!originals.has(attribute) || (lastApplied !== undefined && current !== lastApplied)) {
      originals.set(attribute, current);
    }
    const translated = translateUiText(language, originals.get(attribute) ?? current);
    applied.set(attribute, translated);
    if (current !== translated) element.setAttribute(attribute, translated);
  }
  originalAttributes.set(element, originals);
  appliedAttributes.set(element, applied);
}

function localizeTree(root: Node, language: SupportedLanguage) {
  if (root instanceof Text) {
    localizeTextNode(root, language);
    return;
  }
  if (root instanceof Element) localizeElementAttributes(root, language);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node instanceof Text) localizeTextNode(node, language);
    else if (node instanceof Element) localizeElementAttributes(node, language);
    node = walker.nextNode();
  }
}

export function UiLanguageBridge({ language }: { language: SupportedLanguage }) {
  useEffect(() => {
    const root = document.body;
    localizeTree(root, language);
    let queued = false;
    const pending = new Set<Node>();
    const flush = () => {
      queued = false;
      for (const node of pending) localizeTree(node, language);
      pending.clear();
    };
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        pending.add(mutation.type === 'characterData' ? mutation.target : mutation.target);
        mutation.addedNodes.forEach((node) => pending.add(node));
      }
      if (!queued) {
        queued = true;
        queueMicrotask(flush);
      }
    });
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...LOCALIZED_ATTRIBUTES],
    });
    return () => observer.disconnect();
  }, [language]);
  return null;
}
