/*
LINE Notify Token for 591: <line_notify_token>

分三個試算表，第一個是 Unread，第二個是 Accept，第三個是 Reject

Type: 空白(Unread)，Accept，Accpet (Update)，Reject，Reject (Update)

每分鐘/五分鐘撈一次資料，

開始撈資料之前先檢查 Unread 有沒有 Type 改成 Accept/Reject 的欄位，

  有的話就把該欄搬到 Accept/Reject 的最上面。

  沒有的話就拿到當前的 unixtime 然後透過 updatetime 篩選 now - 90s/330s 的物件，
  拿到物件後先透過 postid 檢查 Accept & Reject 有沒有相同的 postid，

    有的話比較他們的價格，
      有變動就在價格欄位後面加上 (+- $) 以及將 Type 加上 (Update) 然後整欄搬到 Unread 最上面，發送 LINE Notify。
      沒有變動的話就直接換下一個物件。

    沒有的話就透過 postid 拿到 detail 後貼到 Unread，發送 LINE Notify。

最後檢查 Unread, Accept, and Reject 三個 sheet 所有的 post 是否被下架了
  被下架的話就將狀態改成 Removed

*/ 

const unread_sheet_name = "unread";
const accept_sheet_name = "accept";
const reject_sheet_name = "reject";

const refresh_time = 120; // seconds

function check_rent_item_no_duplicated(post_id) {
  let unread_sheet = SpreadsheetApp.getActive().getSheetByName(unread_sheet_name);
  let type_array = unread_sheet.getRange("M2:M").getValues();
  for (let item_index = 0; item_index < type_array.length; item_index++) {
    if (type_array[item_index][0] == post_id) {
      let price = unread_sheet.getRange(`C${item_index + 2}`).getDisplayValue();
      return price.toString()
    }
  }
  return false
}

function check_unread_type() {
  let unread_sheet = SpreadsheetApp.getActive().getSheetByName(unread_sheet_name);
  let type_array = unread_sheet.getRange("A2:A").getValues();
  let type_length = type_array.length;

  for (let type_count = 0; type_count < type_length; type_count++) {
    type_string = type_array[type_count][0];
    if (type_string == "Accept") {
      // Move to accept sheet
    } else if (type_string == "Reject") {
      // Move to reject sheet
    }
  }
}

function get_csrf_token() {
  let rent_home_url = "https://rent.591.com.tw";
  let reg_exp = new RegExp("<meta name=\"csrf-token\" content=\"([A-Za-z0-9]*)\">", "gi");

  let response = UrlFetchApp.fetch(rent_home_url);
  let csrf_token = reg_exp.exec(response)[1];
  const cookie = response.getAllHeaders()["Set-Cookie"][4];
  // Logger.log(`CSRF TOKEN:  ${csrf_token}`);
  // Logger.log(`Cookie: ${cookie}`)

  return [csrf_token, cookie]
}

function get_format_rent_info(rent_result) {
  const rent_result_length = rent_result.length;
  if (rent_result_length < 1) { return [] }
  let format_rent_array = Array();
  for (let rent_index = 0; rent_index < rent_result_length; rent_index++) {
    let rent_item = rent_result[rent_index];
    let rent_post_id = rent_item["id"];
    let rent_price = rent_item["price"];
    let duplicated_price = check_rent_item_no_duplicated(rent_post_id);
    if (duplicated_price == rent_price) {
      return []
    }

    let rent_title = rent_item["address_img"];
    let rent_url = `https://rent.591.com.tw/rent-detail-${rent_post_id}.html`;
    let rent_hyperlink = `=HYPERLINK("${rent_url}", "${rent_title}")`;
    let rent_section_name = rent_item["section_name"];
    let rent_area = rent_item["area"];
    let rent_floor = rent_item["floorInfo"];
    let rent_cover = get_rent_detail(rent_url);
    let tmp_array = ["", rent_hyperlink, rent_price, "", "", "", rent_section_name, "", rent_area, rent_floor, "", "", rent_post_id];
    format_rent_array.push(tmp_array);
    let line_message = `${rent_post_id}\n${rent_title}\n${rent_url}\n$ ${rent_price}\n${rent_section_name} ${rent_area}坪\n${rent_floor}`;
    Logger.log(line_message);
    line_notify(line_message, rent_cover);
  }
  return format_rent_array;
}

function get_rent_data() {
  const timestamp = get_unix_timestamp();

  const rent_result = get_rent_result();
  const rent_json = JSON.parse(rent_result);
  const rent_array = rent_json["data"]["data"];

  const result = rent_array.filter(x => x.refreshtime > timestamp);
  
  return result

}

function get_rent_detail(rent_detail_url) {
  const response = UrlFetchApp.fetch(rent_detail_url);
  let html = response.getContentText();
  // Logger.log(html);
  let cover_img_regex = new RegExp("    <meta property=\"og:image\" content=\"(https:\/\/hp[0-9]\.591\.com\.tw\/house\/active\/[1-9][0-9]{3}\/[0-1][0-9]\/[0-3][0-9]\/[0-9]*_765x517\.water3\.jpg)\" \/>", "gi");
  let detail_address_regex = new RegExp("<span class=\"addr\">(.*)<\/span>");

  Logger.log(detail_address_regex.exec(response));

  let cover_img = cover_img_regex.exec(html);
  if (cover_img) {
    cover_img = cover_img[1];
    return cover_img
  }
  Logger.log(rent_detail_url);
  return "https://www.moedict.tw/%E6%B2%92.png"
}

function get_rent_result() {
  const rent_search_host = "https://rent.591.com.tw/home/search/rsList";
  const rent_search_url = `${rent_search_host}?is_new_list=1&type=1&kind=2&searchtype=1&region=8&section=107,100,101,99&rentprice=1,8000&area=11,20&order=time&orderType=desc`;

  const header_info = get_csrf_token();
  const csrf_token = header_info[0];
  const cookie = header_info[1];

  const header = {
    "X-CSRF-TOKEN": csrf_token,
    "Cookie": cookie + "; urlJumpIp=8; urlJumpIpByTxt=%E5%8F%B0%E4%B8%AD%E5%B8%82;",
    'Content-Type': 'application/json'
  }

  const options = {
    "method": "get",
    "headers": header,
    "muteHttpExceptions": true
  };
  
  const response = UrlFetchApp.fetch(rent_search_url, options);

  // Logger.log(`Rent Result: ${response.getContentText()}`);

  return response.getContentText()
}

function get_unix_timestamp() {
  const date = new Date();
  const unix_timestamp = (Math.floor((date.getTime()/1000)) - refresh_time).toString();
  return unix_timestamp;
}

function line_notify(message, image_url) {
  const line_notify_url = "https://notify-api.line.me/api/notify";
  const header = {
    "Authorization": "Bearer <line_notify_token>",
    'Content-Type': 'application/x-www-form-urlencoded'
  }

  const payload = {
    "message": message,
    "notificationDisabled": true,
    "imageFullsize": image_url,
    "imageThumbnail": image_url
  }

  const options = {
    "method": "post",
    "headers": header,
    "payload": payload,
    "muteHttpExceptions": true
  };
  
  UrlFetchApp.fetch(line_notify_url, options);
}

function main() {
  // Move items if the type is accept or reject
  // check_unread_type();

  const rent_result = get_rent_data();
  const rent_info = get_format_rent_info(rent_result);
  const rent_info_length = rent_info.length;
  if (rent_info_length == 0) { return }

  let unread_sheet = SpreadsheetApp.getActive().getSheetByName(unread_sheet_name);
  unread_sheet.insertRows(2, rent_info_length);

  let range = unread_sheet.getRange(`A2:M${rent_info_length + 1}`);
  range.setValues(rent_info);
}
