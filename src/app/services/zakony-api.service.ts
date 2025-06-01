import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { catchError, map } from 'rxjs/operators';
import { Storage } from '@ionic/storage-angular';
import { Observable, throwError, from } from 'rxjs';
import { Injectable } from '@angular/core';
import { tap } from 'rxjs/operators';
import { Http } from '@capacitor-community/http';
import { Capacitor } from '@capacitor/core';


interface ApiResponse {
  Result?: {
    Title?: string;
    EffectFrom?: string;
    EffectTill?: string | null;
    [key: string]: any;
  };
  Api1?: {
    DocHead?: any;
    Error?: { httpstatuscode: number; message?: string };
    [key: string]: any;
  };
  DocHead?: any;
  Error?: { httpstatuscode: number; message?: string };
  [key: string]: any;
}

@Injectable({
  providedIn: 'root',
})

export class ZakonyApiService {
  private baseUrl = '';
  //private readonly baseUrl = 'https://www.zakonyprolidi.cz/api/v1/data.json';
  //private readonly baseUrl = '/api/api/v1/data.json'; // Proxy path
  // API key: test (only few laws are available) or private APIKey

  constructor(private http: HttpClient, private storage: Storage) {
    this.storage.create();
  }

  /**
   * Gets the API key from Storage.
   * @returns Promise resolving to the API key
   */
  private async getApiKey(): Promise<string> {
    const apiKey = await this.storage.get('apiKey') || 'test';
    return apiKey;
  }

  /**
   * Fetches document metadata using the DocHead method.
   * @param standardized Standardized regulation text (e.g., "n.v. c. 123/2020 sb.")
   * @returns Observable with the API response
  */
  async getDocHead(standardized: string): Promise<Observable<any>> {
    const { collection, document } = this.parseStandardizedText(standardized);
    const apiKey = await this.getApiKey();
    const params = {
      apikey: apiKey,
      Collection: collection,
      Document: document,
    };

    if (Capacitor.isNativePlatform()) {
      // Native platform: Use Capacitor HTTP plugin
      this.baseUrl = 'https://www.zakonyprolidi.cz/api/v1/data.json';
      const urlWithParams = `${this.baseUrl}/DocHead?apikey=${encodeURIComponent(apiKey)}&Collection=${encodeURIComponent(collection)}&Document=${encodeURIComponent(document)}`
      const options = {
        url: urlWithParams,
        method: 'GET',
      };
      try {
        console.log('Native API DocHead request options:', options); // Debug log
        const response = await Http.request(options);
        console.log('Native API DocHead response:', response); // Debug log
        if (!response) {
          throw new Error('Response is null');
        }
        if (response.status < 200 || response.status >= 300) {
          throw new Error(`HTTP error: ${response.status} - ${response.data?.Error?.message || 'Unknown error'}`);
        }
        if (!response.data) {
          throw new Error('No data in response');
        }
        const parsedResponse = this.handleResponse(response.data);
        return from(Promise.resolve(parsedResponse));
      } catch (error) {
        console.error('Native API DocHead error:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        return throwError(() => new Error(this.handleNativeError(error)));
      }
    } else {
      // Web platform: Use HttpClient
      this.baseUrl = '/api/api/v1/data.json'; // Proxy path
      const url = `${this.baseUrl}/DocHead`;
      return this.http.get<ApiResponse>(url, { params }).pipe(
        tap(() => {console.log("API DocHead request: " + url, params )}), // Debug log
        map(response => this.handleResponse(response)),
        catchError(this.handleError)
      );
    }
  }

  /**
   * Fetches document data using the DocData method.
   * @param collection Collection identifier (e.g., "cs")
   * @param document Document identifier (e.g., "2006-262")
   * @returns Observable with the API response
  */
  async getDocData(collection: string, document: string): Promise<Observable<any>> {
    const apiKey = await this.getApiKey();
    const url = `${this.baseUrl}/DocData`;
    const params = {
      apikey: apiKey,
      Collection: collection,
      Document: document,
    };

    if (Capacitor.isNativePlatform()) {
      // Native platform: Use Capacitor HTTP plugin
      this.baseUrl = 'https://www.zakonyprolidi.cz/api/v1/data.json';
      const urlWithParams = `${this.baseUrl}/DocData?apikey=${encodeURIComponent(apiKey)}&Collection=${encodeURIComponent(collection)}&Document=${encodeURIComponent(document)}`
      const options = {
        url: urlWithParams,
        method: 'GET',
      };
      try {
        console.log('Native API DocData request options:', options); // Debug log
        const response = await Http.request(options);
        console.log('Native API DocData response:', response); // Debug log
        if (!response) {
          throw new Error('Response is null');
        }
        if (response.status < 200 || response.status >= 300) {
          throw new Error(`HTTP error: ${response.status} - ${response.data?.Error?.message || 'Unknown error'}`);
        }
        if (!response.data) {
          throw new Error('No data in response');
        }
        const parsedResponse = this.handleResponse(response.data);
        return from(Promise.resolve(parsedResponse));
      } catch (error) {
        console.error('Native API DocData error:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        return throwError(() => new Error(this.handleNativeError(error)));
      }
    } else {
      // Web platform: Use HttpClient
      this.baseUrl = '/api/api/v1/data.json'; // Proxy path
      const url = `${this.baseUrl}/DocData`;
      return this.http.get<ApiResponse>(url, { params }).pipe(
        tap(() => {console.log("API DocData request: " + url, params )}), // Debug log
        map(response => this.handleResponse(response)),
        catchError(this.handleError)
      );
    }
  }

  /**
   * Parses standardized text into Collection and Document parameters.
   * @param standardized Standardized text
   * @returns Object with collection and document
  */
  public parseStandardizedText(standardized: string): { collection: string; document: string } {
    const match = standardized.match(/(?:(n\.v\.|z\.|v\.)\s*)?(?:c\.\s*)?(\d{2,4}\/\d{2,4})(?:\s*sb\.)?/i);
    if (!match) {
      console.warn(`Invalid standardized format: "${standardized}"`);
      throw new Error('Invalid standardized format');
    }
    const number = match[2];
    const collection = 'cs';
    // Format Document as "YYYY-NNN" (e.g., "123/2020" -> "2020-123")
    const [num, year] = number.split('/');
    const document = `${year}-${num}`;
    return { collection, document };
  }

  /**
   * Processes the API response, extracting the result or throwing an error.
   * @param response API response
   * @returns Extracted result
  */
  private handleResponse(response: ApiResponse): any {
    console.log('Raw API response:', response); // Debug log
    if (!response) {
      throw new Error('API error: Empty response');
    }
    // Check for Result (new structure)
    if (response.Result) {
      return response.Result;
    }

    // Check for direct Error or DocHead at root
    if (response.Error && response.Error.httpstatuscode !== 200) {
      throw new Error(`API error: ${response.Error.message || 'Unknown error'} (HTTP ${response.Error.httpstatuscode})`);
    }
    if (response.DocHead) {
      return response.DocHead;
    }

    // Check Api1 structure
    const result = response.Api1;
    if (!result) {
      throw new Error('API error: Invalid response structure (missing Result or Api1)');
    }
    if (result.Error && result.Error.httpstatuscode !== 200) {
      throw new Error(`API error: ${result.Error.message || 'Unknown error'} (HTTP ${result.Error.httpstatuscode})`);
    }
    return result.DocHead || result;
  }

  /**
   * Handles HTTP errors for HttpClient (web).
   * @param error HttpErrorResponse
   * @returns Observable with error
  */
  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'An error occurred';
    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `Client error: ${error.error.message}`;
    } else {
      // Server-side error
      if (error.status === 500) {
        errorMessage = `Server error: HTTP 500 - Internal Server Error. Wrong API key or the document may not exist.`;
      } else {
        errorMessage = `Server error: ${error.status} - ${error.message}`;
      }
      if (error.error?.Api1?.Error) {
        errorMessage = `API error: ${error.error.Api1.Error.message || 'Unknown error'} (HTTP ${error.error.Api1.Error.httpstatuscode})`;
      }
    }
    console.error(errorMessage);
    return throwError(() => new Error(errorMessage));
  }

  /**
   * Handles errors for Capacitor HTTP plugin (native).
   * @param error Error from Http.request
   * @returns Error message string
   */
  private handleNativeError(error: any): string {
    let errorMessage = 'An error occurred';
    if (error.status) {
      if (error.status === 500) {
        errorMessage = `Server error: HTTP 500 - Internal Server Error. Wrong API key or the document may not exist.`;
      } else {
        errorMessage = `Server error: ${error.status} - ${error.error || 'Unknown error'}`;
      }
    } else if (error.message) {
      errorMessage = `Client error: ${error.message}`;
    }
    console.error('Native error:', errorMessage);
    return errorMessage;
  }

  async testApiCall(): Promise<Observable<any>> {
  if (Capacitor.isNativePlatform()) {
    const url = 'https://www.zakonyprolidi.cz/api/v1/data.json/DocHead?apikey=test&Collection=cs&Document=2006-262';
    const options = {
      url: url,
      method: 'GET',
    };
    try {
      console.log('Native API Test request URL:', url);
      console.log('Native API Test request options:', options);
      const response = await Http.request(options);
      console.log('Native API Test response (full):', JSON.stringify(response, null, 2));
      if (!response) {
        throw new Error('Response is null');
      }
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`HTTP error: ${response.status} - ${response.data?.Error?.message || 'Unknown error'}`);
      }
      if (!response.data) {
        throw new Error('No data in response');
      }
      return from(Promise.resolve(response.data));
    } catch (error) {
      console.error('Native API Test error:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      return throwError(() => new Error(this.handleNativeError(error)));
    }
  } else {
    // Not working because of CORS (API calls above works)
    const url = 'https://www.zakonyprolidi.cz/api/v1/data.json/DocHead?apikey=test&Collection=cs&Document=2006-262';
    return this.http.get(url).pipe(
      tap(response => console.log('API Test request (web):', response)),
      catchError(this.handleError)
    );
  }
}


}