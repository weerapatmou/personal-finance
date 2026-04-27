import { describe, expect, it } from "vitest";
import { parseSell965BarPrice } from "@/lib/prices/goldtraders";

describe("parseSell965BarPrice", () => {
  it("extracts the sell price from a typical goldtraders.or.th HTML row", () => {
    const html = `
      <table>
        <tr>
          <td>ทองคำแท่ง 96.5%</td>
          <td>47,200.00</td>
          <td>47,300.00</td>
        </tr>
      </table>
    `;
    expect(parseSell965BarPrice(html)).toBe(47300);
  });

  it("returns null when the label is missing", () => {
    const html = "<html><body>no gold here</body></html>";
    expect(parseSell965BarPrice(html)).toBeNull();
  });

  it("returns null when fewer than two numbers follow the label", () => {
    const html = "ทองคำแท่ง 96.5% 47,000";
    expect(parseSell965BarPrice(html)).toBeNull();
  });

  it("handles spacing variants in the label", () => {
    const html = "ทองคำแท่ง  96.5  %  46,800.00 46,900.00";
    expect(parseSell965BarPrice(html)).toBe(46900);
  });
});
