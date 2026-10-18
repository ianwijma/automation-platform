/* A disposable X11 fixture and tiny EWMH responder, never a real desktop. */
#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <X11/Xatom.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
int main(int argc, char **argv) {
  if (argc != 2) return 2;
  Display *d = XOpenDisplay(NULL); if (!d) return 3;
  Window root = DefaultRootWindow(d), w = XCreateSimpleWindow(d, root, 50, 50, 640, 180, 0, 0, WhitePixel(d, 0));
  Atom clients = XInternAtom(d,"_NET_CLIENT_LIST",False), active = XInternAtom(d,"_NET_ACTIVE_WINDOW",False), check = XInternAtom(d,"_NET_SUPPORTING_WM_CHECK",False);
  XChangeProperty(d,root,clients,XA_WINDOW,32,PropModeReplace,(unsigned char*)&w,1);
  XChangeProperty(d,root,check,XA_WINDOW,32,PropModeReplace,(unsigned char*)&w,1);
  XChangeProperty(d,w,check,XA_WINDOW,32,PropModeReplace,(unsigned char*)&w,1);
  Atom supported[] = { clients, active, check };
  XChangeProperty(d,root,XInternAtom(d,"_NET_SUPPORTED",False),XA_ATOM,32,PropModeReplace,(unsigned char*)supported,3);
  unsigned long pid=getpid(), desktop=0;
  XChangeProperty(d,w,XInternAtom(d,"_NET_WM_PID",False),XA_CARDINAL,32,PropModeReplace,(unsigned char*)&pid,1);
  XChangeProperty(d,w,XInternAtom(d,"_NET_WM_DESKTOP",False),XA_CARDINAL,32,PropModeReplace,(unsigned char*)&desktop,1);
  char *title="AP Fixture"; XStoreName(d,w,title);
  XChangeProperty(d,w,XInternAtom(d,"_NET_WM_NAME",False),XInternAtom(d,"UTF8_STRING",False),8,PropModeReplace,(unsigned char*)title,strlen(title));
  XClassHint hint={"ap-fixture","APFixture"}; XSetClassHint(d,w,&hint);
  XSelectInput(d,root,SubstructureNotifyMask|SubstructureRedirectMask);
  XSelectInput(d,w,ExposureMask|KeyPressMask|ButtonPressMask);
  XMapWindow(d,w); XSetInputFocus(d,w,RevertToParent,CurrentTime);
  GC gc=XCreateGC(d,w,0,NULL); XSetForeground(d,gc,BlackPixel(d,0));
  XFontStruct *font=XLoadQueryFont(d,"9x15");
  if(!font) { fprintf(stderr,"X11 fixture requires the 9x15 font (install xfonts-base)\n"); XCloseDisplay(d); return 4; }
  XSetFont(d,gc,font->fid);
  FILE *events=fopen(argv[1],"w"); setbuf(events,NULL);
  printf("READY %lu\n",w); fflush(stdout);
  for (;;) {
    XEvent e; XNextEvent(d,&e);
    if(e.type==Expose) { char *text="AUTOMATION 12345"; XDrawString(d,w,gc,35,60,text,strlen(text)); }
    if(e.type==ClientMessage && e.xclient.message_type==active) { XSetInputFocus(d,w,RevertToParent,CurrentTime); XChangeProperty(d,root,active,XA_WINDOW,32,PropModeReplace,(unsigned char*)&w,1); }
    if(e.type==KeyPress) { char text[64]; KeySym key; int n=XLookupString(&e.xkey,text,sizeof(text),&key,NULL); if(n>0) fwrite(text,1,n,events); }
    if(e.type==ButtonPress) fprintf(events,"CLICK:%u:%d:%d\n",e.xbutton.button,e.xbutton.x,e.xbutton.y);
    XFlush(d);
  }
}
