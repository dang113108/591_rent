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
const search_city = "台北市";

const search_querys = [
  //藍線
  "?is_format_data=1&is_new_list=1&type=1&multiNotice=not_cover,all_sex,boy&mrtstation=168&mrt=1&rentprice=,11000&showMore=1&order=posttime&orderType=desc&mrtline=168&mrtcoods=4181,4267,4221,4260,4258&searchtype=4",
  "?is_format_data=1&is_new_list=1&type=1&multiNotice=not_cover,boy,all_sex&mrtstation=168&mrt=1&rentprice=,11000&showMore=1&order=posttime&orderType=desc&mrtline=168&mrtcoods=4274&searchtype=4",
  //紅線
  "?is_format_data=1&is_new_list=1&type=1&multiNotice=not_cover,boy,all_sex&mrtstation=168&mrt=1&rentprice=,11000&showMore=1&mrtline=125&mrtcoods=4180,4179,4178&searchtype=4&order=posttime&orderType=desc",
  //棕線
  //"?is_format_data=1&is_new_list=1&type=1&multiNotice=not_cover,boy,all_sex&mrtstation=168&mrt=1&kind=2&rentprice=,11000&showMore=1&mrtline=162&mrtcoods=66266,4221,66265,4200,4184&searchtype=4&order=posttime&orderType=desc", 
  //綠線
  "?is_format_data=1&is_new_list=1&type=1&multiNotice=not_cover,boy,all_sex&mrtstation=168&mrt=1&rentprice=,11000&showMore=1&mrtline=148&mrtcoods=4242,66266,4180,4241&searchtype=4&order=posttime&orderType=desc"
];
// 搜尋獨立套房 & 分租套房，類型請選擇"不限"，設為true會自動補上獨立套房與分租套房的條件
const is_suite = true;

// -------------篩選器---------------

// 是否允許頂樓(去除所有頂樓，避免頂加以次充好，如不要頂樓加蓋請自行在search_querys設定)
const allow_top_floor = false;
//我是懶人(濾掉沒電梯或者樓層 > degree_of_industriousness的物件)
const i_am_lazy = true;
const degree_of_industriousness = 3;
// 我不是穴居人(不住地下室)
const i_am_not_caveman = true;
// -------------篩選器---------------

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
  const all_cookie = response.getAllHeaders()["Set-Cookie"];
  let cookie;
  for (let i = 0; i < all_cookie.length; i++) {
    if (all_cookie[i].includes("591_new_session")) {
      cookie = all_cookie[i];
      break;
    }
  }
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
    let rent_url = `https://rent.591.com.tw/home/${rent_post_id}`;
    let rent_hyperlink = `=HYPERLINK("${rent_url}", "${rent_title}")`;
    let rent_section_name = rent_item["section_name"];
    let rent_street_name = rent_item["street_name"];
    let rent_area = rent_item["area"];
    let rent_location = rent_item["location"];
    let rent_floor = rent_item["floor_str"];
    let rent_cover = get_rent_cover_img(rent_item["photo_list"]);

    let tmp_array = ["", rent_hyperlink, rent_price, "", "", "", rent_section_name+rent_street_name+" / "+rent_location, "", rent_area, rent_floor, "", "", rent_post_id, Utilities.formatDate(new Date(), "GMT+8", "yyyy/MM/dd HH:mm:ss")];
    format_rent_array.push(tmp_array);

    let line_message = `${rent_post_id}\n${rent_title}\n${rent_url}\n$ ${rent_price}\n${rent_section_name} ${rent_street_name}\n${rent_location}\n${rent_area}坪，${rent_floor}`;
    send_to_line_notify(line_message, rent_cover);
  }
  return format_rent_array;
}

function get_region_from_query(query) {
  let reg_exp = new RegExp(".*region=([0-9]*).*", "gi");
  if(reg_exp.test(query) === false){
    return 1 // default is Taipei;
  }
  reg_exp.lastIndex = 0;
  let region_number = reg_exp.exec(query)[1];
  return region_number;
}

function get_rent_cover_img(photo_list) {
  const tryGetLargeImage = (uri) => {    
    let cover_img_regex = new RegExp("(.*?)\!", "gi");
    let cover_img = cover_img_regex.exec(uri);
    if (cover_img) {
      cover_img = cover_img[1]+ "!1920x1080.jpg";
      return cover_img;
    }
    return uri;
  }

  
  if(photo_list.length > 1){
    return tryGetLargeImage(photo_list[1]);
  } else if(photo_list.length > 0)
  {
    return tryGetLargeImage(photo_list[0]);
  }
  return "https://www.moedict.tw/%E6%B2%92.png";
}

function uniqueByKey(array, key) {
  return [...new Map(array.map((x) => [x[key], x])).values()];
}



function get_rent_data() {
  let collect = undefined;  
  search_querys.forEach(search_query => {
    if(is_suite == true)
    {
      let rent_result = get_rent_result(search_query + "&kind=2");
      let rent_json = JSON.parse(rent_result);
      let rent_array = rent_json["data"]["data"];
      if(collect == undefined)
      {
        collect = rent_array;
      }
      else
      {
        collect = collect.concat(rent_array);
      }
      rent_result = get_rent_result(search_query + "&kind=3");
      rent_json = JSON.parse(rent_result);
      rent_array = rent_json["data"]["data"];
      collect = collect.concat(rent_array);
      if(i_am_lazy){
        rent_result = get_rent_result(search_query + "&kind=2&shape=2");
        rent_json = JSON.parse(rent_result);
        rent_array = rent_json["data"]["data"];
        
        add_elevator(rent_array["rent_tag"])

        collect = collect.concat(rent_array);

        rent_result = get_rent_result(search_query + "&kind=3&shape=2");
        rent_json = JSON.parse(rent_result);
        rent_array = rent_json["data"]["data"];

        add_elevator(rent_array["rent_tag"])

        collect = collect.concat(rent_array);
      }
    }
    else
    {
      let rent_result = get_rent_result(search_query);
      let rent_json = JSON.parse(rent_result);
      let rent_array = rent_json["data"]["data"];
      if(collect == undefined)
      {
        collect = rent_array;
      }
      else
      {
        collect = collect.concat(rent_array);
      }
      if(i_am_lazy){
        rent_result = get_rent_result(search_query + "&shape=2");
        rent_json = JSON.parse(rent_result);
        rent_array = rent_json["data"]["data"];
        rent_array.forEach(rent=>{
          add_elevator(rent["rent_tag"])
        });

        collect = collect.concat(rent_array);
      }
    }
  });
  collect = uniqueByKey(collect,'post_id');


  return collect
}

function get_rent_result(query) {
  const rent_search_host = "https://rent.591.com.tw/home/search/rsList";
  let rent_search_url = `${rent_search_host}${query}`;

  const header_info = get_csrf_token();
  const csrf_token = header_info[0];
  const cookie = header_info[1];
  const search_city_url_encode = encodeURIComponent(search_city);
  let region_number = get_region_from_query(query);

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

function with_elevator(rent_tag){
  for(let index in rent_tag){
    if(rent_tag[index]["id"] == "10")
      return true;
  }  
  return false;
}

function add_elevator(rent_tag){
  if(rent_tag != undefined && with_elevator(rent_tag) == false)
    rent_tag.push({id:"10", name:"有電梯"});
  return;
}

function main() {
  let rent_result = get_rent_data();

  if(allow_top_floor == false){
    rent_result = rent_result.filter(function(value){
      const floors= /(.*?)\/(\d+F)/g.exec(value["floor_str"]);
      if(floors == undefined)
      {
        return true;
      }
      return floors[1] != floors[2];
    });
  }

  if(i_am_lazy == true){
    rent_result = rent_result.filter(function(value){
      if(value["floor_str"] == undefined)
        return true;
      const floors = /(\d+)F\/(\d+F)/g.exec(value["floor_str"]);
      if(floors == undefined)
      {
        return true;
      }
      
      return parseInt(floors[1]) <= degree_of_industriousness || with_elevator(value["rent_tag"]);
    });
  }

  if(i_am_not_caveman == true){
    rent_result = rent_result.filter(function(value){
      if(value["floor_str"] == undefined)
        return true;
      const floors = /B(\d+)\//g.exec(value["floor_str"]);
      
      return floors == undefined;
    });
  }
  const rent_info = get_formated_rent_info(list_sheet_name, rent_result);
  const rent_info_length = rent_info.length;
  if (rent_info_length == 0) { return }

  let list_sheet = SpreadsheetApp.getActive().getSheetByName(list_sheet_name);
  list_sheet.insertRows(2, rent_info_length);

  let range = list_sheet.getRange(`A2:N${rent_info_length + 1}`);
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
