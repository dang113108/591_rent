/*
Type: Empty(Uncheck)，Accept，Reject

  拿到當前的 unixtime 然後透過更新時間篩選 now - ${refresh_time} 的物件，
  拿到物件後先透過 postid 檢查當前列表中有沒有相同的 postid，

    有的話比較他們的價格，
      有變動就重新 post 一次並且發送 LINE Notify。
      沒有變動的話就直接換下一個物件。

    沒有的話就透過 postid 拿到 detail 後貼到列表中，發送 LINE Notify。
  
*/ 

const list_sheet_name = "list";
const line_notify_token = "LINE_NOTIFY_TOKEN";
const refresh_time = 120;
const search_city = "台中市";
const search_query = "?is_new_list=1&type=1&kind=2&searchtype=1&region=8&section=107,100,101,99&rentprice=1,7000&area=7,20&order=time&orderType=desc";

function check_rent_item_no_duplicated(search_sheet, post_id) {
  let list_sheet = SpreadsheetApp.getActive().getSheetByName(search_sheet);
  let type_array = list_sheet.getRange("M2:M").getValues();

  for (let item_index = 0; item_index < type_array.length; item_index++) {
    if (type_array[item_index][0] == post_id) {
      let price = list_sheet.getRange(`C${item_index + 2}`).getDisplayValue();
      return price.toString()
    }
  }
  return false
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

function get_formated_rent_info(search_sheet, rent_result) {
  const rent_result_length = rent_result.length;
  if (rent_result_length < 1) { return [] }

  let format_rent_array = Array();
  for (let rent_index = 0; rent_index < rent_result_length; rent_index++) {

    let rent_item = rent_result[rent_index];
    let rent_post_id = rent_item["id"];
    let rent_price = rent_item["price"];
    let duplicated_price = check_rent_item_no_duplicated(search_sheet, rent_post_id);

    if (duplicated_price == rent_price) {
      continue;
    }

    let rent_title = rent_item["address_img"];
    let rent_url = `https://rent.591.com.tw/rent-detail-${rent_post_id}.html`;
    let rent_hyperlink = `=HYPERLINK("${rent_url}", "${rent_title}")`;
    let rent_section_name = rent_item["section_name"];
    let rent_street_name = rent_item["street_name"];
    let rent_area = rent_item["area"];
    let rent_floor = rent_item["floorInfo"];
    let rent_cover = get_rent_cover_img(rent_url);

    let tmp_array = ["", rent_hyperlink, rent_price, "", "", "", rent_section_name+rent_street_name, "", rent_area, rent_floor, "", "", rent_post_id];
    format_rent_array.push(tmp_array);

    let line_message = `${rent_post_id}\n${rent_title}\n${rent_url}\n$ ${rent_price}\n${rent_section_name} ${rent_street_name}\n${rent_area}坪，${rent_floor}`;
    send_to_line_notify(line_message, rent_cover);
  }
  return format_rent_array;
}

function get_rent_cover_img(rent_detail_url) {
  const response = UrlFetchApp.fetch(rent_detail_url);
  let html = response.getContentText();

  let cover_img_regex = new RegExp("    <meta property=\"og:image\" content=\"(https:\/\/hp[0-9]\.591\.com\.tw\/house\/active\/[1-9][0-9]{3}\/[0-1][0-9]\/[0-3][0-9]\/[0-9]*_765x517\.water3\.jpg)\" \/>", "gi");

  let cover_img = cover_img_regex.exec(html);
  if (cover_img) {
    cover_img = cover_img[1];
    return cover_img
  }
  Logger.log(rent_detail_url);
  return "https://www.moedict.tw/%E6%B2%92.png"
}

function get_rent_data() {
  const last_timestamp = get_refresh_timestamp();

  const rent_result = get_rent_result();
  const rent_json = JSON.parse(rent_result);
  const rent_array = rent_json["data"]["data"];

  const result = rent_array.filter(x => x.refreshtime > last_timestamp);
  
  return result
}

function get_rent_result() {
  const rent_search_host = "https://rent.591.com.tw/home/search/rsList";
  let rent_search_url = `${rent_search_host}${search_query}`;

  const header_info = get_csrf_token();
  const csrf_token = header_info[0];
  const cookie = header_info[1];
  const search_city_url_encode = encodeURIComponent(search_city);

  const header = {
    "X-CSRF-TOKEN": csrf_token,
    "Cookie": `${cookie}; urlJumpIp=8; urlJumpIpByTxt=${search_city_url_encode};`,
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

function get_refresh_timestamp() {
  const date = new Date();
  const unix_timestamp = (Math.floor((date.getTime()/1000)) - refresh_time).toString();
  return unix_timestamp;
}

function main() {
  const rent_result = get_rent_data();
  const rent_info = get_formated_rent_info(list_sheet_name, rent_result);
  const rent_info_length = rent_info.length;
  if (rent_info_length == 0) { return }

  let list_sheet = SpreadsheetApp.getActive().getSheetByName(list_sheet_name);
  list_sheet.insertRows(2, rent_info_length);

  let range = list_sheet.getRange(`A2:M${rent_info_length + 1}`);
  range.setValues(rent_info);
}

function send_to_line_notify(message, image_url) {
  const line_notify_url = "https://notify-api.line.me/api/notify";

  const header = {
    "Authorization": `Bearer ${line_notify_token}`,
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
