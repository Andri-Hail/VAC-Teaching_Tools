from tkinter import *
def stopProg(e):
    label1.configure(text="changed")

    
root=Tk()
label1=Label(root,text="nothing to say")
label1.pack()
button1=Button(root,text="Hello World click to close")
button1.pack()
button1.bind('<Button-1>',stopProg)
root.mainloop()