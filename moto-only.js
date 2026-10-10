/* Câu chỉ dành cho xe mô tô / xe gắn máy (không áp dụng cho ô tô).
   Lập bằng cách quét từ khoá rồi duyệt tay; sửa danh sách ở đây là quiz và audio đều theo.
   Câu hỏi chung cho cả ô tô và mô tô (vd. 27, 119, 145, 146, 254, 266, 556) không nằm trong danh sách. */
window.MOTO_ONLY = new Set([
  35, 48, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 110, 124, 125, 126,
  144, 167, 178, 191, 200, 206, 242, 255, 257, 258, 259, 260, 261, 285,
  304, 305, 306, 307, 344, 345, 349, 350, 507, 539,
]);
/* Mặc định bật lọc; lựa chọn nhớ chung cho quiz và audio. */
window.skipMoto = function () {
  try { return localStorage.getItem("gplx-skip-moto") !== "0"; } catch (e) { return true; }
};
window.setSkipMoto = function (on) {
  try { localStorage.setItem("gplx-skip-moto", on ? "1" : "0"); } catch (e) { /* bỏ qua */ }
};
