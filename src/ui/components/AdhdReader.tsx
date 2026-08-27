/**
 * ADHD Reader — bionic reading over rendered message text.
 *
 * This transforms the React element tree rather than the DOM.
 *
 * The obvious implementation — let React render, then walk the DOM and wrap
 * words — is what the original SillyTavern extension does, and it is wrong
 * here. React keeps direct references to the text nodes it created; rewriting
 * or merging them behind its back makes the next update throw on a node that
 * no longer exists, which unmounts the tree and blanks the screen. Streaming
 * makes it certain rather than occasional, because the message re-renders on
 * every token.
 *
 * So instead of touching rendered output, this maps over the children React is
 * about to render and substitutes styled spans for the text. React stays the
 * only thing that mutates the DOM, and turning the feature off is a true
 * no-op — the children pass through completely untouched.
 */

import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

import { toBionicTokens, type BionicIntensity } from "../../core/adhd/bionic";

/** Element types whose text must be left exactly as written. */
const SKIP_TYPES = new Set(["code", "pre", "script", "style", "textarea", "input"]);

function transformString(text: string, intensity: BionicIntensity, keyPrefix: string): ReactNode {
  const tokens = toBionicTokens(text, intensity);
  if (!tokens.some((token) => token.bold > 0)) return text;

  return tokens.map((token, index) => {
    if (token.bold <= 0) return token.text;
    return (
      <span className="adhd-token" key={`${keyPrefix}-${index}`}>
        <span className="adhd-bold">{token.text.slice(0, token.bold)}</span>
        {token.text.slice(token.bold)}
      </span>
    );
  });
}

function transformNode(node: ReactNode, intensity: BionicIntensity, keyPrefix: string): ReactNode {
  if (typeof node === "string") {
    return transformString(node, intensity, keyPrefix);
  }

  // Numbers, booleans, null and undefined have no words to emphasise.
  if (!isValidElement(node)) return node;

  const element = node as ReactElement<{ children?: ReactNode }>;
  if (typeof element.type === "string" && SKIP_TYPES.has(element.type)) {
    return element;
  }

  const children = element.props?.children;
  if (children === undefined || children === null) return element;

  return cloneElement(element, undefined, transformChildren(children, intensity, keyPrefix));
}

function transformChildren(
  children: ReactNode,
  intensity: BionicIntensity,
  keyPrefix: string,
): ReactNode {
  return Children.map(children, (child, index) =>
    transformNode(child, intensity, `${keyPrefix}-${index}`),
  );
}

export interface AdhdReaderProps {
  intensity: BionicIntensity;
  /**
   * Present for call-site clarity about what drives the transform. The
   * transform is derived from `children` directly, so nothing is cached and
   * this needs no invalidation.
   */
  contentKey?: string;
  className?: string;
  children: ReactNode;
}

export function AdhdReader({ intensity, className, children }: AdhdReaderProps) {
  // Off is a genuine pass-through: no wrapper element, no traversal, nothing
  // for React to reconcile differently than it would without this component.
  if (intensity === "off") {
    return <>{children}</>;
  }

  let transformed: ReactNode;
  try {
    transformed = transformChildren(children, intensity, "adhd");
  } catch {
    // A reading aid must never be the reason a message fails to render.
    transformed = children;
  }

  return className ? <div className={className}>{transformed}</div> : <>{transformed}</>;
}
