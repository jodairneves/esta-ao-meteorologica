import { describe, expect, it } from 'vitest';
import { skyColors } from './sky';

const lightness = (elevation: number, overcast = 0) => {
  const { top } = skyColors(elevation, overcast);
  return top.getHSL({ h: 0, s: 0, l: 0 }).l;
};

describe('skyColors', () => {
  it('brightens from night to day', () => {
    expect(lightness(-30)).toBeLessThan(lightness(-4));
    expect(lightness(-4)).toBeLessThan(lightness(30));
  });

  it('greys the sky when it rains', () => {
    const clear = skyColors(30).top.getHSL({ h: 0, s: 0, l: 0 }).s;
    const rainy = skyColors(30, 0.75).top.getHSL({ h: 0, s: 0, l: 0 }).s;
    expect(rainy).toBeLessThan(clear);
  });

  it('clamps beyond the first and last stops', () => {
    expect(skyColors(-90).top.getHexString()).toBe(skyColors(-18).top.getHexString());
    expect(skyColors(90).top.getHexString()).toBe(skyColors(35).top.getHexString());
  });
});
