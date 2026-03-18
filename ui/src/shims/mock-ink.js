// Mock implementation of Ink
import React from 'react';

export const render = () => {};
export const Box = ({ children }) => React.createElement('div', {}, children);
export const Text = ({ children }) => React.createElement('span', {}, children);
export const Newline = () => React.createElement('br');
export const Spacer = () => React.createElement('div', { style: { height: '1em' } });
export const Static = () => null;
export const Transform = ({ children }) => children;
export const useInput = () => {};
export const useApp = () => ({ exit: () => {} });
export const useStdin = () => ({ stdin: null, setRawMode: () => {} });
export const useStdout = () => ({ stdout: null, write: () => {} });

// Mock ink components
export const BigText = () => null;
export const Gradient = ({ children }) => children;
export const Spinner = () => null;
export const TextInput = () => null;
export const SelectInput = () => null;
