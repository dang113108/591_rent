# 超簡單一鍵推播 591 租屋資訊完全免 Coding－透過 Google Sheet 與 LINE Notify 

### 2021/09/08 更新：
感謝邦友 [flier268](https://ithelp.ithome.com.tw/users/20132779/profile), [travis668](https://github.com/travis668) 幫忙修復因 591 改版導致抓不到 cover image 的問題！
Github: [https://github.com/dang113108/591_rent/tree/dev](https://github.com/dang113108/591_rent/tree/dev)

----

### 2021/02/22 更新：
感謝邦友 [Chil](https://ithelp.ithome.com.tw/users/20127063/profile) 幫忙抓到一個 Bug，如果有在之前嘗試使用失敗的朋友再麻煩覆蓋最新版本的 Code 或直接重來一次，謝謝！
Github: [https://github.com/dang113108/591_rent/tree/dev](https://github.com/dang113108/591_rent/tree/dev)

----

現在房子合約是到六月底，有鑑於租的地方離公司及市區有大概半小時的車程，因此在過完年後的二月中我認為差不多可以開始找下一間房子了。  

剛好我的朋友 [Robin](https://ithelp.ithome.com.tw/users/20110242/articles) 在我們的群組分享了他寫的 [rentHouse](https://github.com/aiyu666/rentHouse) 這個工具，透過 node.js 自己去架設一個 server 來爬 591 的資訊並且推播到 LINE Notify，讓我們可以即時追蹤新發布的物件，效果其實已經相當不錯。~~但是我沒用，對不起，我沒用~~  

但這次要分享的算是基於他的想法以及我之前使用過 Google Sheet 的經驗來開發的，透過 Google Apps Script 內建的「觸發條件」我們可以設定每分鐘爬一次 591 的資訊，並且一樣推播到 LINE Notify 外，我們還可以將這些資料統整至 Google Sheet 上，去篩選哪些是我可以考慮的，而哪些是我不想要的；而最重要的－不需要任何指令、npm、或安裝額外的東西，只要根據這篇文章的教學，任何人都可以自己架設一個！

# 功能介紹
* 每分鐘透過你設定的篩選條件到 591 網站上爬蟲並將資訊上傳至 Google Sheet 及推播到 LINE Notify
* 如果該物件已曾經推播過且**價格沒有變動**，不會再次推播
* 如果該物件已曾經推播過且**價格有變動**，會再次推播
* 透過 Google Sheet 特性，可多人同時編輯 （但請注意你的 LINE Notify Token 可能會外洩）
* 透過 LINE 特性，可多人加入同一群組一起討論

# 實際使用多週後的展示
* Google Sheet

![Google Sheet 實際案例](https://ithelp.ithome.com.tw/upload/images/20210221/20124743tyhXf2eln9.png)

* LINE Notify

![LINE Notify 實際案例](https://ithelp.ithome.com.tw/upload/images/20210221/20124743MeauZkkC83.png)

----

開始設定！

# 第一步，複製 Google Sheet
Google Sheet link: [591 Rent Template](https://docs.google.com/spreadsheets/d/1uQu2jAXHHs8P6cW2blyQX5n2tjwdPIHNNdo5VxTNXy4/edit?usp=sharing)

1. 點進去連結後，記得要先登入你的 Google 帳號
2. 點選「檔案 > 建立副本」

![檔案 > 建立副本](https://ithelp.ithome.com.tw/upload/images/20210221/2012474325szP71ZTc.png)

3. 輸入你想要的名稱後，按下確定來建立副本

![複製文件](https://ithelp.ithome.com.tw/upload/images/20210221/201247436K81j8WX4j.png)

4. 複製完成！

![複製完成](https://ithelp.ithome.com.tw/upload/images/20210221/20124743gn1xE65yA4.png)

# 第二步，取得 591 的資料
591 link: [https://rent.591.com.tw/](https://rent.591.com.tw/)

1. 進入 591 網站後，第一步請先打開瀏覽器的「開發人員工具」
> 開發人員工具開啟方式：[Google Chrome](https://developers.google.com/web/tools/chrome-devtools?hl=zh-tw)

![開啟開發人員工具](https://ithelp.ithome.com.tw/upload/images/20210221/20124743Hwt20eYqHs.png)

2. 進入「Network」的分頁

![Network分頁](https://ithelp.ithome.com.tw/upload/images/20210221/20124743U0x1PFZ4SS.png)

3. 搜尋「/home/search/rsList」，此時還不會看到任何東西

![搜尋 URI](https://ithelp.ithome.com.tw/upload/images/20210221/20124743hVjPUtVEhH.png)

4. 回到 591 的頁面，搜尋你想要的條件

![591篩選條件](https://ithelp.ithome.com.tw/upload/images/20210221/201247432AVa7Yq349.png)

5. 按下「刊登時間」以刊登時間作為排序（最新到最舊）

![以刊登時間做排序](https://ithelp.ithome.com.tw/upload/images/20210221/201247437clcQa1Vow.png)

6. 這時回到「開發人員工具」的畫面，可以看到像是這樣的畫面，已經有資訊了

![已取得 591 資料](https://ithelp.ithome.com.tw/upload/images/20210221/20124743EAG0Li19zn.png)

7. 點選最下面的一筆，待會會需要複製圖片中紅線部分（包括問號）

![取得 591 資料](https://ithelp.ithome.com.tw/upload/images/20210221/201247437gBW7c7BLM.png)

# 第三步，取得 LINE Notify Token
LINE Notify 首頁：[https://notify-bot.line.me/zh_TW/](https://notify-bot.line.me/zh_TW/)

1. 請先將 LINE Notify 加入成為你 LINE 的好友

![將 LINE Notify 加入好友](https://ithelp.ithome.com.tw/upload/images/20210221/20124743L88te24BOv.png)

2. 建議先在 LINE 中創建一個群組，並邀請 LINE Notify 進入你的群組裡

![將 LINE Notify 加入群組](https://ithelp.ithome.com.tw/upload/images/20210221/20124743YzTIAjA63K.png)

3. 進入 LINE Notify 首頁，並請登入你的 LINE 帳號

![登入 LINE Notify](https://ithelp.ithome.com.tw/upload/images/20210221/20124743bVr90bPuxz.png)

4. 進入你的「個人頁面」

![進入個人頁面](https://ithelp.ithome.com.tw/upload/images/20210221/20124743p7fCxMoYcD.png)

5. 點選「發行權杖」

![點選發行權杖](https://ithelp.ithome.com.tw/upload/images/20210221/20124743iNJHMrJagY.png)

6. 尋找你剛剛創建的群組，並輸入這個權杖的名稱（該名稱除了管理用之外也會是推播內容的標題）

![設定發行權杖](https://ithelp.ithome.com.tw/upload/images/20210221/20124743RbfNzNNBNv.png)

7. 點選發行後，會出現該權杖的 Token，請不要將此 Token 外洩以免有人瘋狂傳訊息給你 XD

![複製 Token](https://ithelp.ithome.com.tw/upload/images/20210221/20124743PDC0hdGTqy.png)

8. 待會會需要複製這個 Token，而且此頁面關閉後將沒辦法再次查看這個 Token，所以請先將他複製到一個安全的地方或先不要關閉這個頁面

# 最後一步，將以上取得的資訊放入 Google Sheet 中

1. 請回到你剛剛所建立的 Google Sheet 副本，並且點選「工具 > 指令碼編輯器」

![指令碼編輯器](https://ithelp.ithome.com.tw/upload/images/20210221/201247438nM5d4AhtO.png)

2. 此時會開啟一個新頁面並可以看到原始碼，在這邊我們只需要將剛剛取得的資訊貼到相對應的地方就好
> 請注意必須保留雙引號的部分

![修改 Google Apps Script](https://ithelp.ithome.com.tw/upload/images/20210221/20124743Dz9pF0J9EP.png)

3. 按下儲存按鈕

![儲存專案](https://ithelp.ithome.com.tw/upload/images/20210221/20124743FoYiUyZAO2.png)

4. 接著將上方的功能選取為「main」後點選「執行」

![執行測試](https://ithelp.ithome.com.tw/upload/images/20210221/20124743677yNIi3nH.png)

5. 可能會跳出需要你授權的視窗，請依照他所跳出的視窗登入你的帳號並允許授權

![需要授權](https://ithelp.ithome.com.tw/upload/images/20210221/20124743FocGwRi7DC.png)

![未經驗證](https://ithelp.ithome.com.tw/upload/images/20210222/201247432SQZCBC2pg.png)

![我很安全](https://ithelp.ithome.com.tw/upload/images/20210222/20124743uWnfrIp7PQ.png)

![允許授權](https://ithelp.ithome.com.tw/upload/images/20210221/20124743I83Bff1QQz.png)

6. 確認下方的執行紀錄沒有錯誤即可到下個步驟

![確認執行紀錄](https://ithelp.ithome.com.tw/upload/images/20210221/20124743COm8f5Kt9L.png)

7. 點選左側的鬧鐘圖示（觸發條件）

![進入觸發條件](https://ithelp.ithome.com.tw/upload/images/20210221/20124743Fpf9pWU7eA.png)

8. 點選右下角的「新增觸發條件」

![新增觸發條件](https://ithelp.ithome.com.tw/upload/images/20210221/20124743KOX5gmzFgO.png)

9. 請依序將「選擇您要執行的功能」選擇為「main」、「選取活動來源」選擇為「時間驅動」、選取時間型觸發條件類型選擇為「分鐘計時器」，並確定「選取分鐘間隔」為「每分鐘」後，按下儲存按鈕

![調整觸發條件](https://ithelp.ithome.com.tw/upload/images/20210221/201247431FpeovTCGw.png)

10. 成功！

![新增觸發條件成功](https://ithelp.ithome.com.tw/upload/images/20210221/20124743FMA3Tf6v0A.png)

----

# 成果展示
在以上步驟都完成後，Google Apps Script 便會根據你所設定的條件每分鐘去爬一次 591 的資料，並儲存到你所建立的 Google Sheet 以及推播到你的 LINE Notify。

> 如果過了一分鐘後都沒有任何通知或更新，有可能是剛好過去一兩分鐘都沒有新的物件，所以請不用擔心、繼續等待

* Google Sheet (如果 LINE 有通知但 Google Sheet 上沒有的話，請重新整理 Google Sheet 頁面）

![Google Sheet 成果展示](https://ithelp.ithome.com.tw/upload/images/20210221/201247430t0rZfZQeB.png)

* LINE Notify

![LINE Notify 成果展示](https://ithelp.ithome.com.tw/upload/images/20210221/20124743JkYMYLdHlJ.png)

----

以上分享，有任何問題歡迎留言提問 : )
Github: [https://github.com/dang113108/591_rent/tree/dev](https://github.com/dang113108/591_rent/tree/dev)
