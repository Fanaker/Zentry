package com.fanaker.zentry;
import android.app.Activity;
import android.content.*;
import android.net.Uri;
import android.os.*;
import android.util.Base64;
import android.view.*;
import android.webkit.*;
import android.widget.FrameLayout;
import org.json.JSONObject;
import java.io.*;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.*;

public class MainActivity extends Activity {
 private WebView web;
 private ValueCallback<Uri[]> fileCallback;
 private byte[] pendingFile;
 private DeviceUnlock deviceUnlock;
 private static final String HOST="app.zentry.local";
 @Override public void onCreate(Bundle state){
  super.onCreate(state);
  if (Build.VERSION.SDK_INT >= 33) setRecentsScreenshotEnabled(false);
  getWindow().setDecorFitsSystemWindows(false);
  FrameLayout content = new FrameLayout(this);
  content.setBackgroundColor(0xff0b0e14);
  web = new WebView(this);
  web.setBackgroundColor(0xff0b0e14);
  content.addView(web, new FrameLayout.LayoutParams(-1, -1));
  content.setOnApplyWindowInsetsListener((view, insets) -> {
   android.graphics.Insets safe = insets.getInsets(
       WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
   view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
   return WindowInsets.CONSUMED;
  });
  setContentView(content);
  content.requestApplyInsets();
  deviceUnlock = new DeviceUnlock(this, content, web);
  WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setSupportMultipleWindows(false);
  CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
  web.addJavascriptInterface(new Bridge(),"ZentryAndroid");
  web.setWebViewClient(new WebViewClient(){
   @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest req){
    Uri u=req.getUrl();if(!"https".equals(u.getScheme())||!HOST.equals(u.getHost()))return null;
    String path=u.getPath()==null?"":u.getPath().substring(1);
    if(path.contains("..")||path.contains("\\"))return new WebResourceResponse("text/plain","UTF-8",403,"Forbidden",Map.of(),new ByteArrayInputStream(new byte[0]));
    if(path.isEmpty()||!path.contains("."))path="index.html";
    String mime=path.endsWith(".wasm")?"application/wasm":path.endsWith(".js")?"application/javascript":path.endsWith(".css")?"text/css":path.endsWith(".png")?"image/png":path.endsWith(".svg")?"image/svg+xml":path.endsWith(".ico")?"image/x-icon":"text/html";
    try{return new WebResourceResponse(mime,"UTF-8",200,"OK",Map.of("Cache-Control","no-cache","X-Content-Type-Options","nosniff","Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"),getAssets().open("web/"+path));}
    catch(IOException e){return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",Map.of(),new ByteArrayInputStream(new byte[0]));}
   }
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){
    Uri u=req.getUrl();if("https".equals(u.getScheme())&&HOST.equals(u.getHost()))return false;
    if(req.isForMainFrame()&&"https".equals(u.getScheme()))try{startActivity(new Intent(Intent.ACTION_VIEW,u));}catch(Exception ignored){}
    return true;
   }
  });
  web.setWebChromeClient(new WebChromeClient(){
   @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> cb,FileChooserParams params){
    if(fileCallback!=null)fileCallback.onReceiveValue(null);fileCallback=cb;
    Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
    try{startActivityForResult(i,21);}catch(Exception e){cb.onReceiveValue(null);fileCallback=null;}return true;
   }
  });
  web.loadUrl("https://"+HOST+"/");
 }
 @Override protected void onResume() {
  super.onResume();
  if (deviceUnlock != null) deviceUnlock.onResume();
 }
 private void removeLegacyModels() {
  String error = "";
  try {
   for (String name : List.of("whisper-tiny-v1", "whisper-base-v1")) {
    Path directory = new File(getFilesDir(), name).toPath();
    if (!Files.exists(directory, LinkOption.NOFOLLOW_LINKS)) continue;
    Files.walkFileTree(directory, new SimpleFileVisitor<Path>() {
     @Override public FileVisitResult visitFile(Path file, BasicFileAttributes attributes) throws IOException {
      Files.delete(file);
      return FileVisitResult.CONTINUE;
     }
     @Override public FileVisitResult postVisitDirectory(Path folder, IOException failure) throws IOException {
      if (failure != null) throw failure;
      Files.delete(folder);
      return FileVisitResult.CONTINUE;
     }
    });
   }
  } catch (IOException | SecurityException failure) {
   error = "No se pudieron eliminar todos los modelos. Puedes reintentar.";
  }
  final String result = error;
  runOnUiThread(() -> {
   if (web != null) web.evaluateJavascript("window.zentryCleanupResult?.(" + JSONObject.quote(result) + ")", null);
  });
 }
 private class Bridge{
  @JavascriptInterface public boolean canUseDeviceLock(){return deviceUnlock.isAvailable();}
  @JavascriptInterface public boolean isDeviceLockEnabled(){return deviceUnlock.isEnabled();}
  @JavascriptInterface public void configureDeviceLock(boolean enabled){
   runOnUiThread(() -> deviceUnlock.configure(enabled, error -> {
    if (web != null) web.evaluateJavascript("window.zentryDeviceLockResult && window.zentryDeviceLockResult("
        + JSONObject.quote(error) + ")", null);
   }));
  }
  @JavascriptInterface public void showKeyboard(){
   runOnUiThread(() -> {
    if (web == null || !web.hasFocus()) return;
    WindowInsetsController controller = web.getWindowInsetsController();
    if (controller != null) controller.show(WindowInsets.Type.ime());
   });
  }
  @JavascriptInterface public void removeLegacyModels(){new Thread(MainActivity.this::removeLegacyModels).start();}
  @JavascriptInterface public void saveFile(String name,String mime,String encoded){
   if(encoded.length()>70000000)return;
   runOnUiThread(()->{if(pendingFile!=null)return;try{pendingFile=Base64.decode(encoded,Base64.DEFAULT);Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime);i.putExtra(Intent.EXTRA_TITLE,name.replaceAll("[^a-zA-Z0-9._-]","_"));startActivityForResult(i,22);}catch(Exception e){pendingFile=null;}});
  }
 }
 @Override protected void onActivityResult(int request,int status,Intent data){super.onActivityResult(request,status,data);
  if(request==21&&fileCallback!=null){fileCallback.onReceiveValue(status==RESULT_OK&&data!=null&&data.getData()!=null?new Uri[]{data.getData()}:null);fileCallback=null;}
  if(request==22){if(status==RESULT_OK&&data!=null&&data.getData()!=null&&pendingFile!=null){try(OutputStream out=getContentResolver().openOutputStream(data.getData())){out.write(pendingFile);}catch(Exception ignored){}}pendingFile=null;}
 }
 @Override public void onBackPressed(){if(deviceUnlock.isLocked())super.onBackPressed();else if(web.canGoBack())web.goBack();else super.onBackPressed();}
 @Override protected void onStop(){super.onStop();if(deviceUnlock!=null)deviceUnlock.onStop();}
 @Override protected void onDestroy(){if(web!=null){web.removeJavascriptInterface("ZentryAndroid");web.destroy();web=null;}super.onDestroy();}
}
