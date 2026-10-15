import "@testing-library/jest-dom/vitest";

// jsdom に無いブラウザ API のスタブ
Element.prototype.scrollIntoView = () => {};
Object.defineProperty(window, "scrollTo", { value: () => {}, writable: true });
