# Tìm bạn cùng phòng

- Menu nằm ngay sau Bảng giá dịch vụ, đường dẫn `/tenant/roommates` (cần đăng nhập người thuê).
- Biểu mẫu mới lưu vào cột JSON `lifestyle_vector`, schema_version = 2; không cần đổi schema DB.
- Hồ sơ cũ cần điền lại, không tự chuyển các thanh trượt thành điều kiện bắt buộc.
- Giới tính được khai báo trong hồ sơ tìm bạn vì hồ sơ tài khoản hiện chưa có trường này.
- Chỉ cùng giới tính và khớp cả quy tắc hút thuốc, thú cưng mới được xếp hạng.
- Điểm 0–100: địa điểm 30%, ngân sách 25%, giờ giấc 20%, gọn gàng/ăn chung 15%, thời gian thuê 10%.
- API kết quả trả tên, ngân sách, điểm và SĐT/email của người phù hợp; không trả tọa độ chính xác hay dữ liệu đăng nhập.

## Bản đồ

Để dùng Google Maps, đặt `VITE_GOOGLE_MAPS_API_KEY` trong `client/.env.local`, bật Maps JavaScript API và Places API (New), rồi khởi động lại Vite. Giới hạn browser key theo HTTP referrer của website.

Tài liệu: https://developers.google.com/maps/documentation/javascript/add-google-map

Nếu chưa có key, bản đồ OpenStreetMap hiện có vẫn dùng được, hiển thị rõ nhà cung cấp. Chọn tâm bằng cách nhấn bản đồ hoặc tìm địa chỉ bằng nút tìm kiếm, chọn bán kính 0,5–10 km. Khoảng cách Haversine và diện tích hình tròn trên mặt phẳng địa phương dùng cho khu vực quy mô vài km.

## Chạy và kiểm tra

Khởi động lại backend sau cập nhật. Chạy client bằng `npm run dev` trong `client`, backend bằng `npm run dev` trong `server`.

Kiểm tra thuật toán: `node --test src/utils/roommateMatching.test.js` trong `server`.
Build giao diện: `npm run build` trong `client`.

## Trạng thái tìm bạn

Thanh trạng thái luôn hiển thị trên biểu mẫu và trang kết quả. Đang tìm (`active`) cho phép hồ sơ xuất hiện trong kết quả; Tạm ẩn (`hidden`) và Đã tìm được bạn (`matched`) giữ lại dữ liệu nhưng loại khỏi các lần tìm kiếm mới. Không thu hồi danh sách đã được tải trước đó.

`PATCH /api/roommates/profile/status` nhận `{ "status": "active|hidden|matched" }`, chỉ đổi hồ sơ của tài khoản đăng nhập. Tìm kiếm bị chặn khi hồ sơ không active. Lưu/chỉnh sửa hồ sơ không tự bật lại trạng thái. Bấm Tìm bạn trở lại để chủ động bật lại. Chưa có hồ sơ thì tạo hồ sơ bằng biểu mẫu trước.

Chạy kiểm thử trạng thái: `node --test src/utils/roommateStatus.test.js` trong server.

## Thông tin liên hệ

Thẻ người phù hợp hiển thị phone_number và email từ tài khoản users dưới dạng văn bản để sao chép. Mục thiếu ghi Chưa cập nhật. Không có nút hoặc liên kết gọi điện/soạn email. Chỉ trả thông tin cho người đăng nhập khi hồ sơ ứng viên đang active và vượt qua điều kiện ghép.

## Quyền truy cập

Chỉ role tenant được dùng Tìm bạn. Menu, sidebar và CTA bị ẩn với các role khác; đường dẫn frontend chỉ cho tenant. Tất cả API /api/roommates yêu cầu đăng nhập và middleware đọc role hiện tại trong DB; guest, landlord, admin bị từ chối HTTP 403. Ứng viên cũng chỉ lấy role tenant. Giữ nguyên hồ sơ cũ trong DB nhưng không gợi ý hồ sơ của role khác.

## Điều kiện giao nhau bắt buộc

Địa điểm phải có diện tích giao dương; ngân sách chỉ cần có ít nhất một mức tiền chung, kể cả chạm tại đầu mút. Ví dụ 2–3 triệu và 3–4 triệu vẫn được ghép với điểm tài chính IoU bằng 0. Hai vùng địa điểm chỉ tiếp xúc tại một điểm vẫn không đủ để ghép. Không thỏa một trong hai thì loại trước khi tính điểm; dùng giá trị chưa làm tròn để xét. Giờ giấc, thói quen và thời gian thuê vẫn tính theo điểm như trước.

## Gợi ý vị trí Google Places

Đặt VITE_GOOGLE_MAPS_API_KEY trong client/.env.local, bật Maps JavaScript API và Places API (New), thiết lập billing và HTTP referrer cho domain/localhost đang dùng, rồi khởi động lại Vite. Build production cần key ở thời điểm build.

Ô nhập dùng Google Places Autocomplete Data API với danh sách xổ xuống: gợi ý trong Việt Nam khi gõ, chọn bằng chuột hoặc bàn phím, lấy tọa độ/tên/địa chỉ bằng fetchFields và cập nhật tâm vòng tròn với bán kính đang chọn. Mỗi phiên tìm dùng AutocompleteSessionToken mới sau khi chọn địa điểm. Gửi yêu cầu sau khi dừng gõ 300 ms, hiển thị tối đa 5 gợi ý với tên, địa chỉ và biểu tượng vị trí; hỗ trợ chuột, phím mũi tên, Enter, Escape; loại bỏ kết quả cũ đến chậm. Bản đồ Google đi kèm hiển thị attribution của Google. Khi nhấn Enter trong ô tìm địa điểm không gửi biểu mẫu tìm bạn.

Không có key thì vẫn dùng bản đồ OpenStreetMap và tìm địa chỉ bằng nút như trước; không gọi Google. Không sử dụng kết quả Places để hiển thị trên bản đồ OpenStreetMap.

https://developers.google.com/maps/documentation/javascript/place-autocomplete-new
