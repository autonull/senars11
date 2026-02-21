
import { T } from './tensor/src/backends/NativeBackend.js';
console.log('Has randn:', typeof T.randn);
try {
    const t = T.randn([2, 2]);
    console.log('Result:', t.shape);
} catch (e) {
    console.error(e);
}
