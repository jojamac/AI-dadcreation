import * as Mediabunny from 'mediabunny';

console.log('Keys:', Object.keys(Mediabunny));

try {
    // Check for expected classes
    //@ts-ignore
    console.log('Output:', typeof Mediabunny.Output);
    //@ts-ignore
    console.log('Mp4OutputFormat:', typeof Mediabunny.Mp4OutputFormat);
    //@ts-ignore
    console.log('Muxer?', typeof Mediabunny.Muxer);
} catch (e) {
    console.error(e);
}
