import {Truth} from '@senars/nar';

console.log('Testing Truth class directly:');

// Test direct creation
const truth1 = new Truth(1.0, 0.9);
console.log('Direct creation - f:', truth1.f, 'c:', truth1.c);
console.log('Direct creation - toString:', truth1.toString());

// Test what happens with undefined
try {
    const truth2 = new Truth(undefined, undefined);
    console.log('Undefined creation - f:', truth2.f, 'c:', truth2.c);
} catch (e) {
    console.log('Error with undefined:', e.message);
}

// Test what happens with null
try {
    const truth3 = new Truth(null, null);
    console.log('Null creation - f:', truth3.f, 'c:', truth3.c);
} catch (e) {
    console.log('Error with null:', e.message);
}