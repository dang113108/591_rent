/*

  拿到當前條件前三十筆的物件，
  拿到物件後先透過 postid 檢查當前列表中有沒有相同的 postid，

    有的話比較他們的價格，
      有變動就重新 post 一次並且發送 LINE Notify。
      沒有變動的話就直接換下一個物件。

    沒有的話就透過 postid 拿到 detail 後貼到列表中，發送 LINE Notify。
  
*/ 

const list_sheet_name = "list";
const line_notify_token = "LINE_NOTIFY_TOKEN";
const search_city = "新北市";
const search_query = "?is_format_data=1&is_new_list=1&type=1&region=3&section=26,44,43,38&searchtype=1&kind=2&other=balcony_1&showMore=1&option=washer&multiNotice=not_cover,all_sex,boy&order=posttime&orderType=desc&rentprice=1,12500";

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
  const cookie = response.getAllHeaders()["Set-Cookie"][5];
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
    Logger.log(rent_item);
    let rent_post_id = rent_item["post_id"];
    let rent_price = `${rent_item["price"]} ${rent_item["price_unit"]}`;
    let duplicated_price = check_rent_item_no_duplicated(search_sheet, rent_post_id);

    if (duplicated_price == rent_price) {
      continue;
    }

    let rent_title = rent_item["title"];
    let rent_url = `https://rent.591.com.tw/rent-detail-${rent_post_id}.html`;
    let rent_hyperlink = `=HYPERLINK("${rent_url}", "${rent_title}")`;
    let rent_section_name = rent_item["section_name"];
    let rent_street_name = rent_item["street_name"];
    let rent_area = rent_item["area"];
    let rent_location = rent_item["location"];
    let rent_floor = rent_item["floor_str"];
    let rent_cover = get_rent_cover_img(rent_url, rent_post_id);

    let tmp_array = ["", rent_hyperlink, rent_price, "", "", "", rent_section_name+rent_street_name+" / "+rent_location, "", rent_area, rent_floor, "", "", rent_post_id];
    format_rent_array.push(tmp_array);

    let line_message = `${rent_post_id}\n${rent_title}\n${rent_url}\n$ ${rent_price}\n${rent_section_name} ${rent_street_name}\n${rent_location}\n${rent_area}坪，${rent_floor}`;
    send_to_line_notify(line_message, rent_cover);
  }
  return format_rent_array;
}

function get_region_from_query(query) {
  let reg_exp = new RegExp(".*region=([0-9]*).*", "gi");
  let region_number = reg_exp.exec(query)[1];

  return region_number;
}

function get_rent_cover_img(rent_detail_url, rent_post_id) {
  const response = UrlFetchApp.fetch(rent_detail_url);
  let html = response.getContentText();

  let cover_img_regex = new RegExp("    <meta property=\"og:image\" content=\"(https:\/\/hp[0-9]\.591\.com\.tw\/house\/active\/[1-9][0-9]{3}\/[0-1][0-9]\/[0-3][0-9]\/[0-9]*_765x517\.water3\.jpg)\" \/>", "gi");

  let cover_img = cover_img_regex.exec(html);
  if (cover_img) {
    cover_img = cover_img[1];
    return cover_img
  }

  const fetch_and_get_first_photo = (_rent_id)=>{
    const photo_list_url = `https://api.591.com.tw/tw/v1/house/photos?type=1&id=${_rent_id}`;
    const photo_html_fetch = UrlFetchApp.fetch(photo_list_url);
    const photo_html_text = photo_html_fetch.getContentText();
    const photo = JSON.parse(photo_html_text);
    const photo_list = photo.data.photos;
    const first_img = photo_list[0];
    return first_img.cutPhoto;
  }

  try { 
    const first_img_url = fetch_and_get_first_photo(rent_post_id)
    return first_img_url 
  } catch (fetch_error) {
    Logger.log(fetch_error)
  }

  Logger.log(rent_detail_url);
  return "https://www.moedict.tw/%E6%B2%92.png"
}

function get_rent_data() {
  const rent_result = get_rent_result();
  const rent_json = JSON.parse(rent_result);
  const rent_array = rent_json["data"]["data"];
  
  return rent_array
}

function get_rent_result() {
  const rent_search_host = "https://rent.591.com.tw/home/search/rsList";
  let rent_search_url = `${rent_search_host}${search_query}`;

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

  const response = UrlFetchApp.fetch(rent_search_url, options);

  // Logger.log(`Rent Result: ${response.getContentText()}`);

  return response.getContentText()
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
