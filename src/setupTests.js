import { TextEncoder, TextDecoder } from 'util';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

const Enzyme = require('enzyme');
const Adapter = require('@chalbert/enzyme-adapter-react-18');

Enzyme.configure({ adapter: new Adapter() });
