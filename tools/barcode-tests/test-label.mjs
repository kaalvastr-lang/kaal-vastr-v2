import { buildZpl, buildLabelModel, labelToSvg, zplEscape, mmToDots, TEST_LABEL_ITEM, fitText } from "./out/label.js";
import { DEFAULT_LABEL_SETTINGS as S } from "./out/settings.js";
const item = { barcode: "KV000001", productName: "Oversized T-Shirt", size: "M", colour: "Black" };
console.log("dots:", mmToDots(50, 203), "x", mmToDots(25, 203));
console.log(buildZpl(item, S, 20));
const m = buildLabelModel(item, S);
console.log("warnings:", m.warnings);
const bc = m.elements.find(e => e.type === "barcode");
console.log("barcode x:", bc.x, "width dots:", 123 * bc.moduleWidth, "right edge:", bc.x + 123*bc.moduleWidth, "of", m.widthDots);
// long name truncates, special chars escaped
const long = buildZpl({ ...item, productName: "Extremely Long Product Name For Oversized Cotton T-Shirt ^XZ~JA_", colour: "Navy ~ Blue" }, S, 1);
console.log(long.split("\n").filter(l => l.startsWith("^FH")).join("\n"));
console.log("escape:", zplEscape("a^b~c_d\\e"));
console.log("fitText:", fitText("Extremely Long Product Name For Oversized Cotton T-Shirt", 26, 376));
// no price anywhere
console.log("contains price words?", /₹|price|cost|profit|selling/i.test(buildZpl(item, S, 1)));
// too-wide barcode warns
console.log("wide warn:", buildLabelModel({ ...item, barcode: "KV12345678901234567" }, S).warnings.length > 0);
// svg builds
console.log("svg bytes:", labelToSvg(item, S, { border: true }).length);
// copies clamp
console.log(buildZpl(item, S, 100000).match(/\^PQ\d+/)[0], buildZpl(item, S, 0).match(/\^PQ\d+/)[0]);
// multi-colour-less attribute
console.log(buildZpl({ ...item, colour: "" }, S, 1).match(/Size[^\^]*/)[0]);
