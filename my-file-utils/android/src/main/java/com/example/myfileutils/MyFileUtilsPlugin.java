package com.example.myfileutils;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import android.content.ContentResolver;
import android.net.Uri;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;

@CapacitorPlugin(name = "MyFileUtils")
public class MyFileUtilsPlugin extends Plugin {

    @PluginMethod
    public void getFileExtension(PluginCall call) {
        String uriString = call.getString("uri");
        if (uriString == null) {
            call.reject("URI not provided");
            return;
        }

        try {
            Uri uri = Uri.parse(uriString);
            ContentResolver resolver = getContext().getContentResolver();
            String mimeType = resolver.getType(uri);

            String extension = "";
            if (mimeType != null) {
                extension = getExtensionFromMimeType(mimeType);
            } else {
                String fileName = uri.getLastPathSegment();
                if (fileName != null) {
                    int dotIndex = fileName.lastIndexOf('.');
                    if (dotIndex != -1) {
                        extension = fileName.substring(dotIndex + 1);
                    }
                }
            }

            JSObject ret = new JSObject();
            ret.put("extension", extension);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Error getting file extension: " + e.getMessage());
        }
    }

    @PluginMethod
    public void readFileContent(PluginCall call) {
        String uriString = call.getString("uri");
        if (uriString == null) {
            call.reject("URI not provided");
            return;
        }

        try {
            Uri uri = Uri.parse(uriString);
            ContentResolver resolver = getContext().getContentResolver();
            StringBuilder content = new StringBuilder();

            try (InputStream inputStream = resolver.openInputStream(uri);
                 BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    content.append(line).append("\n");
                }
            }

            JSObject ret = new JSObject();
            ret.put("content", content.toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to read file content: " + e.getMessage());
        }
    }

    private String getExtensionFromMimeType(String mimeType) {
        switch (mimeType.toLowerCase()) {
            case "application/pdf": return "pdf";
            case "image/jpeg": return "jpg";
            case "image/png": return "png";
            case "text/plain": return "txt";
            case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": return "docx";
            default: return "";
        }
    }
}