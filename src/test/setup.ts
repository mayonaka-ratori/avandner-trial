import "@testing-library/jest-dom/vitest";

// jsdom に無いブラウザ API のスタブ
Element.prototype.scrollIntoView = () => {};
Object.defineProperty(window, "scrollTo", { value: () => {}, writable: true });
Object.defineProperty(window, "matchMedia", {
  value: (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }),
  writable: true,
});
