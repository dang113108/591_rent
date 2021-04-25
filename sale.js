/**
 * 原本是找591租屋的形式
 * 以下改成找中古屋的程式碼
 * 
 * BTW, google sheet記得要換成下面這個
 * https://docs.google.com/spreadsheets/d/11cSptjPpIU5hhUbnQgLccToctesrSO56GuUaVXpd7LM/edit?usp=sharing
 */

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
const line_notify_token = "YOUR_LINE_NOTIFY_TOKEN";
const refresh_time = 120;
var search_size = 1; // 尋找的縣市數量，city_arr & query_arr的數量需與此相同
var city_arr = ["新竹縣"];
var query_arr = ["?type=2&shType=list&section=54&regionid=5&price=800$_1600$&shape=2&pattern=2,3&order=posttime_desc"];
// 如果需要找超過一個縣市，可以改用下面的
// var search_size = 2;
// var city_arr = ["新竹縣", "新竹市"];
// var query_arr = ["?type=2&shType=list&section=54&regionid=5&price=800$_1600$&shape=2&pattern=2,3&order=posttime_desc", "?type=2&shType=list&section=371&regionid=4&pattern=2,3&price=800$_1600$&shape=2&order=posttime_desc"];
var search_city = "";
var search_query = "";

function check_sale_item_no_duplicated(search_sheet, post_id) {
  let list_sheet = SpreadsheetApp.getActive().getSheetByName(search_sheet);
  let type_array = list_sheet.getRange("M2:M").getValues(); // 用來檢查的欄位

  for (let item_index = 0; item_index < type_array.length; item_index++) {
    if (type_array[item_index][0] == post_id) {
      let price = list_sheet.getRange(`C${item_index + 2}`).getDisplayValue();
      return price.toString()
    }
  }
  return false
}

function get_csrf_token() {
  let sale_home_url = "https://sale.591.com.tw";
  let reg_exp = new RegExp("<meta name=\"csrf-token\" content=\"([A-Za-z0-9]*)\">", "gi");

  let response = UrlFetchApp.fetch(sale_home_url);
  let csrf_token = reg_exp.exec(response)[1];
  const cookie = response.getAllHeaders()["Set-Cookie"][3];

  return [csrf_token, cookie]
}

function get_formated_sale_info(search_sheet, sale_result) {
  const sale_result_length = sale_result.length;
  if (sale_result_length < 1) { return [] }

  let format_sale_array = Array();
  for (let sale_index = 0; sale_index < sale_result_length; sale_index++) {

    let sale_item = sale_result[sale_index];
    let sale_post_id = sale_item["houseid"];
    let sale_price = sale_item["showprice"] + "\u842c";
    
    // 檢查重複
    let duplicated_price = check_sale_item_no_duplicated(search_sheet, sale_post_id);
    if (duplicated_price == sale_price) {
      continue;
    }

    let sale_title = sale_item["title"];
    let sale_url = `https://sale.591.com.tw/home/house/detail/2/${sale_post_id}.html`;
    let sale_hyperlink = `=HYPERLINK("${sale_url}", "${sale_title}")`;
    let sale_community_name = sale_item["community_name"];
    let sale_age = sale_item["showhouseage"];
    let sale_room = sale_item["room"];
    let sale_floor = sale_item["floor"];
    let sale_address = sale_item["region_name"] + sale_item["section_name"] + sale_item["address"];
    let sale_has_car_port = sale_item["has_carport"] > 0 ? "Yes" : "No";
    let sale_main_area = sale_item["mainarea"];
    let sale_area = sale_item["area"];
    let sale_unit_price = sale_item["unit_price"];
    let sale_cover = sale_item["photo_url"];
    

    // 製作google試算表物件
    // Type	LINK	總價	社區	屋齡	格局	樓層	地址	有車位	主建物坪數	權狀坪數	單價	POST_ID TIME
    var time = new Date().toLocaleString('zh-Hant', { timeZone: 'Asia/Taipei' });
    let tmp_array = ["", sale_hyperlink, sale_price, sale_community_name, sale_age, sale_room, sale_floor, sale_address, sale_has_car_port, sale_main_area, sale_area, sale_unit_price, sale_post_id, time];
    format_sale_array.push(tmp_array);

    // 傳送到line
    let line_message = `${sale_community_name}\n${sale_title}\n${sale_address} \n\u683c\u5c40: ${sale_room}\n\u6a13\u5c64: ${sale_floor}, \u4e3b\u5efa\u7269: ${sale_main_area}坪\nNT$ ${sale_price}\n${sale_url}`;
    send_to_line_notify(line_message, sale_cover);
  }
  return format_sale_array;
}

function get_region_from_query(query) {
  let reg_exp = new RegExp(".*regionid=([0-9]*).*", "gi");
  let region_number = reg_exp.exec(query)[1];

  return region_number;
}

function get_sale_cover_img(sale_detail_url) {
  const response = UrlFetchApp.fetch(sale_detail_url);
  let html = response.getContentText();

  let cover_img_regex = new RegExp("    <meta property=\"og:image\" content=\"(https:\/\/hp[0-9]\.591\.com\.tw\/house\/active\/[1-9][0-9]{3}\/[0-1][0-9]\/[0-3][0-9]\/[0-9]*_765x517\.water3\.jpg)\" \/>", "gi");

  let cover_img = cover_img_regex.exec(html);
  if (cover_img) {
    cover_img = cover_img[1];
    return cover_img
  }
  Logger.log(sale_detail_url);
  return "https://www.moedict.tw/%E6%B2%92.png"
}

function get_sale_data() {
  const last_timestamp = get_refresh_timestamp();

  const sale_result = get_sale_result();
  const sale_json = JSON.parse(sale_result);
  const sale_array = sale_json["data"]["house_list"];

  const result = sale_array.filter(x => x.refreshtime > last_timestamp);
  
  return result
}

function get_sale_result() {
  const sale_search_host = "https://sale.591.com.tw/home/search/list";
  let sale_search_url = `${sale_search_host}${search_query}`;

  const header_info = get_csrf_token();
  const csrf_token = header_info[0];
  const cookie = header_info[1];
  const search_city_url_encode = encodeURIComponent(search_city);
  let region_number = get_region_from_query(search_query);

  const header = {
    "X-CSRF-TOKEN": csrf_token,
    "Cookie": `${cookie}; urlJumpIp=${region_number}; urlJumpIpByTxt=${search_city_url_encode};`,
    'Content-Type': 'application/json'
  }

  const options = {
    "method": "get",
    "headers": header,
    "muteHttpExceptions": true
  };
  
  const response = UrlFetchApp.fetch(sale_search_url, options);

  return response.getContentText()
}

function get_refresh_timestamp() {
  const date = new Date();
  const unix_timestamp = (Math.floor((date.getTime()/1000)) - refresh_time).toString();
  return unix_timestamp;
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

function main() {
  for (var i = 0; i < search_size; i++) {
    search_city = city_arr[i];
    search_query = query_arr[i];
    const sale_result = get_sale_data();
    const sale_info = get_formated_sale_info(list_sheet_name, sale_result);
    const sale_info_length = sale_info.length;
    if (sale_info_length == 0) { 
      continue;
    }

    let list_sheet = SpreadsheetApp.getActive().getSheetByName(list_sheet_name);
    list_sheet.insertRows(2, sale_info_length);

    let range = list_sheet.getRange(`A2:N${sale_info_length + 1}`);
    range.setValues(sale_info);
  }
}