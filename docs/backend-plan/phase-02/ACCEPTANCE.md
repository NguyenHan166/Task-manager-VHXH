# Phase 02 — Implementation và ma trận nghiệm thu

**Trạng thái:** Hoàn thành Phase 02. BE-02-01 đến BE-02-04 đã triển khai; ma trận BE-02-05 chạy PASS trên PostgreSQL scratch riêng ở localhost.

## Phạm vi đã triển khai

- `AuthModule` cung cấp login, refresh xoay vòng, logout, logout-all, hồ sơ cá nhân và đổi mật khẩu. Mật khẩu dùng bcrypt; DB chỉ giữ SHA-256 của refresh token. Access token 15 phút gắn `sub` và `sid`; guard kiểm tra chữ ký, thời hạn, session đang sống và trạng thái user ở mọi request.
- Login sai email, sai mật khẩu và tài khoản LOCKED cùng trả `401` với cùng thông báo. Login bucket giới hạn 5 lần/phút theo IP và hash email. Endpoint khác bỏ qua bucket login và dùng giới hạn mặc định.
- `/users` dùng DTO an toàn: MANAGER nhận DTO admin; DEPUTY_MANAGER nhận danh bạ ACTIVE; STAFF nhận projection danh bạ ACTIVE. Non-Manager không thể liệt kê hoặc đọc tài khoản LOCKED. Chỉ MANAGER được tạo/sửa/reset tài khoản.
- Tạo user không nhập password sẽ sinh temporary password ngẫu nhiên và chỉ trả một lần. Reset luôn trả mật khẩu mới một lần; không lưu plaintext, không ghi vào audit hoặc notification. Đổi mật khẩu/reset/đổi role/khóa/mở khóa/đổi email thu hồi session trong transaction.
- Password nhập vào được giới hạn tối đa 72 byte UTF-8 để không bị bcrypt cắt cụt đầu vào; password mới cần ít nhất 12 ký tự.
- Khóa cuối cùng hoặc hạ role của ACTIVE MANAGER dùng advisory transaction lock và kiểm tra số ACTIVE MANAGER sau update; transaction rollback nếu số lượng về 0. Không cho phép tự khóa.
- Task access policy đã có helper query scoped cho OFFICIAL/TEAM/PERSONAL; `UserAccessPolicy` áp dụng cùng quyết định 403/404 của Phase 00. Workload theo công thức DATA_MODEL: primary chỉ đếm OFFICIAL hợp lệ; collaborator đếm lời mời ACCEPTED trên OFFICIAL/TEAM, trừ việc người đó là chủ trì; đúng hạn so với `completionDueAtSnapshot`.
- OpenAPI được sinh lại từ `phase-00/build_openapi.py`, bổ sung `DirectoryUser`, `CreateUserResult`, shape phân trang user và mô tả workload. `ApiExceptionFilter` đổi `fieldErrors` về chuỗi theo D-05.

## Ma trận bảo mật đã chạy

Chạy `npm run auth:check` với API tại `http://127.0.0.1:3010/api` và PostgreSQL scratch tại `127.0.0.1:5434`. Database được tạo mới, áp dụng migration và seed P0 trước khi chạy. Script từ chối mọi host không phải localhost; output nghiệm thu chỉ có dòng PASS/FAIL, không in credential. Container, volume, API process và log tạm được xóa sau lần chạy.

| Ca kiểm tra                                                       | Kết quả yêu cầu                                                                                                                   | Bằng chứng runtime |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Ba fixture MANAGER/DEPUTY_MANAGER/STAFF đăng nhập; JWT hết hạn    | Đăng nhập thành công; JWT hết hạn trả `401`                                                                                       | PASS               |
| Email không tồn tại, mật khẩu sai, hoặc user LOCKED đăng nhập     | Cùng `401`; không trả cookie; cùng thông báo                                                                                      | PASS               |
| Login vượt ngưỡng theo IP và hash email                           | N lần trong ngưỡng được xử lý; lượt kế tiếp `429 RATE_LIMITED`                                                                    | PASS               |
| Logout, logout-all, refresh sau logout, replay/refresh đồng thời  | Phiên bị thu hồi trả `401`; chỉ một refresh đồng thời được `200`; refresh mới dùng được                                           | PASS               |
| Khóa user khi user đang có phiên; đọc user LOCKED bằng ID         | Access trả `401`; DEPUTY/STAFF nhận `404` khi dò ID                                                                               | PASS               |
| Reset password và đổi password cá nhân                            | Session cũ bị thu hồi; mật khẩu cũ không đăng nhập; mật khẩu mới đăng nhập được                                                   | PASS               |
| Đổi role khi user đang có phiên                                   | Session cũ bị thu hồi; đăng nhập mới nhận role mới; quyền Manager-only bị từ chối                                                 | PASS               |
| Cập nhật hồ sơ, danh bạ và workload                               | Tự sửa trường cho phép; tự đổi role `400`; DTO danh bạ không lộ dữ liệu quản trị; workload đúng role; khoảng ngày đảo chiều `400` | PASS               |
| STAFF/DEPUTY_MANAGER gọi API quản trị user                        | Nhận `403`; hai role vẫn đọc danh bạ ACTIVE; STAFF không đọc LOCKED                                                               | PASS               |
| Tạo user bằng password sinh tự động hoặc password do Manager nhập | Password tự sinh trả một lần; password Manager nhập không bị echo; DTO không lộ hash                                              | PASS               |
| Manager cuối bị khóa/hạ role đồng thời                            | Luôn còn đúng một ACTIVE MANAGER                                                                                                  | PASS               |
| MANAGER khóa chính mình                                           | `409`                                                                                                                             | PASS               |

Static checks: `npm run format:check`, `npm run lint`, `npm run typecheck` và `npm run build` đều PASS. Script ma trận là [check-auth.ts](../../../Server/scripts/check-auth.ts).
