#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <winsock2.h>
#include <windows.h>
#include <shellapi.h>
#include <sys/stat.h>
#include <ctype.h>
#pragma comment(lib, "ws2_32.lib")
#pragma comment(lib, "shell32.lib")

#define PORT 8080
#define BUF_SIZE 4096

const char* get_mime_type(const char *path) {
    const char *ext = strrchr(path, '.');
    if (!ext) return "text/plain";

    if (strcmp(ext, ".html") == 0) return "text/html";
    if (strcmp(ext, ".htm") == 0)  return "text/html";
    if (strcmp(ext, ".css") == 0)  return "text/css";
    if (strcmp(ext, ".js") == 0)   return "application/javascript";
    if (strcmp(ext, ".png") == 0)  return "image/png";
    if (strcmp(ext, ".jpg") == 0)  return "image/jpeg";
    if (strcmp(ext, ".jpeg") == 0) return "image/jpeg";
    if (strcmp(ext, ".gif") == 0)  return "image/gif";
    if (strcmp(ext, ".ico") == 0)  return "image/x-icon";
    if (strcmp(ext, ".json") == 0) return "application/json";
    return "text/plain";
}

void send_file(SOCKET client_fd, const char *path) {
    FILE *fp = fopen(path, "rb");
    if (!fp) {
        const char *not_found =
            "HTTP/1.1 404 Not Found\r\n"
            "Content-Type: text/html\r\n"
            "Access-Control-Allow-Origin: *\r\n"
            "Connection: close\r\n"
            "\r\n"
            "<h1>404 Not Found</h1>";
        send(client_fd, not_found, strlen(not_found), 0);
        return;
    }

    struct stat st;
    stat(path, &st);
    long file_size = st.st_size;

    const char *mime = get_mime_type(path);

    char header[512];
    sprintf(header,
        "HTTP/1.1 200 OK\r\n"
        "Content-Type: %s\r\n"
        //"Access-Control-Allow-Origin: *\r\n"
        "Content-Length: %ld\r\n"
        "Connection: close\r\n"
        "\r\n",
        mime, file_size);
    send(client_fd, header, strlen(header), 0);

    char buffer[BUF_SIZE];
    size_t n;
    while ((n = fread(buffer, 1, BUF_SIZE, fp)) > 0) {
        send(client_fd, buffer, n, 0);
    }

    fclose(fp);
}

void url_decode(char *dst, const char *src) {
    char a, b;
    while (*src) {
        if ((*src == '%') && ((a = src[1]) && (b = src[2])) && isxdigit(a) && isxdigit(b)) {
            char hex[3] = {a, b, 0};
            *dst++ = (char) strtol(hex, NULL, 16);
            src += 3;
        } else if (*src == '+') {
            *dst++ = ' ';
            src++;
        } else {
            *dst++ = *src++;
        }
    }
    *dst = '\0';
}

void handle_client(SOCKET client_fd) {
    char buffer[BUF_SIZE];
    int total = 0;
    int n;
    while ((n = recv(client_fd, buffer + total, BUF_SIZE - 1 - total, 0)) > 0) {
        total += n;
        buffer[total] = '\0';
        if (strstr(buffer, "\r\n\r\n")) break; // ��� ��
        if (total >= BUF_SIZE - 1) break;
    }
    if (total <= 0) return;

    printf("Request:\n%s\n", buffer);

    char *line_end = strstr(buffer, "\r\n");
    if (!line_end) return;
    char line[512];
    int len = (int)(line_end - buffer);
    if (len >= (int)sizeof(line)) len = sizeof(line)-1;
    strncpy(line, buffer, len);
    line[len] = '\0';

    char method[16], raw_path[512];
    raw_path[0] = '\0';
    if (sscanf(line, "%15s %511s", method, raw_path) < 2) {
        return;
    }

    char path[512];
    if (strncmp(raw_path, "http://", 7) == 0 || strncmp(raw_path, "https://", 8) == 0) {
       
        char *p = strchr(raw_path + (strncmp(raw_path,"https://",8)==0?8:7), '/');
        if (p) strncpy(path, p, sizeof(path)-1);
        else strncpy(path, "/", sizeof(path)-1);
    } else {
        strncpy(path, raw_path, sizeof(path)-1);
    }
    path[sizeof(path)-1] = '\0';

    char *q = strchr(path, '?');
    if (q) *q = '\0';

    char *h = strchr(path, '#');
    if (h) *h = '\0';

    if (strcmp(path, "/") == 0) strncpy(path, "/index.html", sizeof(path)-1);

    char decoded[512];
    url_decode(decoded, path);

    printf("Resolved path: '%s' -> '%s'\n", raw_path, decoded);

    char filepath[1024];
    snprintf(filepath, sizeof(filepath), ".%s", decoded);

    send_file(client_fd, filepath);
}

int main() {
    WSADATA wsa;
    SOCKET server_fd, client_fd;
    struct sockaddr_in server_addr, client_addr;
    int client_addr_len = sizeof(client_addr);

    printf("Initializing Winsock...\n");
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) {
        printf("WSAStartup failed: %d\n", WSAGetLastError());
        return 1;
    }

    server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd == INVALID_SOCKET) {
        printf("Socket creation failed: %d\n", WSAGetLastError());
        WSACleanup();
        return 1;
    }

    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = INADDR_ANY;
    server_addr.sin_port = htons(PORT);

    if (bind(server_fd, (struct sockaddr*)&server_addr, sizeof(server_addr)) == SOCKET_ERROR) {
        printf("Bind failed: %d\n", WSAGetLastError());
        closesocket(server_fd);
        WSACleanup();
        return 1;
    }

    if (listen(server_fd, 5) == SOCKET_ERROR) {
        printf("Listen failed: %d\n", WSAGetLastError());
        closesocket(server_fd);
        WSACleanup();
        return 1;
    }

    printf("Static HTTP server running on http://localhost:%d\n", PORT);

   ShellExecute(NULL, "open", "http://localhost:8080/home.html", NULL, NULL, SW_SHOWNORMAL);

    while (1) {
        client_fd = accept(server_fd, (struct sockaddr*)&client_addr, &client_addr_len);
        if (client_fd == INVALID_SOCKET) {
            printf("Accept failed: %d\n", WSAGetLastError());
            continue;
        }

        handle_client(client_fd);
        closesocket(client_fd);
    }

    closesocket(server_fd);
    WSACleanup();
    return 0;
}

